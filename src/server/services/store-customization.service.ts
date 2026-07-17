import { Prisma, type CustomizationRevisionOrigin } from '@prisma/client';

import {
  createDefaultCustomization,
  evaluateCustomizationContrast,
} from '@/features/customization/domain';
import {
  customizationPublishSchema,
  customizationVersionSchema,
  storeCustomizationConfigSchema,
  type StoreCustomizationConfig,
} from '@/schemas/customization';
import { requireSuperAdminStoreAccess } from '@/server/auth';
import { getDb } from '@/server/database/client';
import { ConflictError, NotFoundError, ValidationError } from '@/server/errors';
import * as customizationRepo from '@/server/repositories/store-customization.repository';

function parseConfig(value: unknown): StoreCustomizationConfig {
  const parsed = storeCustomizationConfigSchema.safeParse(value);
  if (!parsed.success) {
    throw new ValidationError(
      'A configuração de personalização é inválida.',
      parsed.error.issues.map((item) => ({
        field: item.path.join('.'),
        message: item.message,
      })),
    );
  }
  return parsed.data;
}

function validationError(message: string, issues: { path: PropertyKey[]; message: string }[]) {
  return new ValidationError(
    message,
    issues.map((item) => ({ field: item.path.join('.'), message: item.message })),
  );
}

function parseVersion(value: unknown) {
  const parsed = customizationVersionSchema.safeParse({ expectedDraftVersion: value });
  if (!parsed.success) {
    throw validationError('A versão do rascunho é inválida.', parsed.error.issues);
  }
  return parsed.data;
}

function parsePublishInput(input: { expectedDraftVersion: unknown; reason: unknown }) {
  const parsed = customizationPublishSchema.safeParse(input);
  if (!parsed.success) {
    throw validationError('Os dados da publicação são inválidos.', parsed.error.issues);
  }
  return parsed.data;
}

function changedSections(before: StoreCustomizationConfig, after: StoreCustomizationConfig) {
  return (Object.keys(after) as (keyof StoreCustomizationConfig)[]).filter(
    (key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]),
  );
}

function assertBrandingPolicy(config: StoreCustomizationConfig) {
  if (!config.platformBranding.showPedidoLocalBranding) {
    throw new ValidationError(
      'A remoção da marca PedidoLocal ainda não está habilitada para esta loja.',
    );
  }
}

async function ensureScopedCustomization(tenantId: string, storeId: string) {
  const context = await requireSuperAdminStoreAccess(tenantId, storeId);
  const customization = await customizationRepo.ensureCustomization(
    tenantId,
    storeId,
    createDefaultCustomization(),
  );
  return { context, customization };
}

function assertExpectedVersion(current: number, expected: number) {
  if (current !== expected) {
    throw new ConflictError(
      'O rascunho foi alterado em outra sessão. Recarregue a página antes de continuar.',
    );
  }
}

export async function getAdminCustomizationData(tenantId: string, storeId: string) {
  const { context, customization } = await ensureScopedCustomization(tenantId, storeId);
  const publishedConfig = parseConfig(customization.publishedConfig);
  const draftConfig = customization.draftConfig ? parseConfig(customization.draftConfig) : null;
  const revisions = await customizationRepo.listRevisions(tenantId, storeId);
  const effectiveConfig = draftConfig ?? publishedConfig;

  return {
    store: context.store,
    customization: {
      id: customization.id,
      schemaVersion: customization.schemaVersion,
      publishedConfig,
      draftConfig,
      effectiveConfig,
      draftVersion: customization.draftVersion,
      publishedVersion: customization.publishedVersion,
      publishedAt: customization.publishedAt,
      hasDraft: draftConfig !== null,
      contrastIssues: evaluateCustomizationContrast(effectiveConfig),
    },
    revisions,
  };
}

export async function saveCustomizationDraft(
  tenantId: string,
  storeId: string,
  input: { config: unknown; expectedDraftVersion: unknown },
) {
  const config = parseConfig(input.config);
  assertBrandingPolicy(config);
  const version = parseVersion(input.expectedDraftVersion);
  const { context, customization } = await ensureScopedCustomization(tenantId, storeId);
  assertExpectedVersion(customization.draftVersion, version.expectedDraftVersion);

  const previous = parseConfig(customization.draftConfig ?? customization.publishedConfig);
  const nextDraftVersion = customization.draftVersion + 1;
  const changed = changedSections(previous, config);

  await getDb().$transaction(async (tx) => {
    const updated = await tx.storeCustomization.updateMany({
      where: {
        id: customization.id,
        tenantId,
        storeId,
        draftVersion: version.expectedDraftVersion,
      },
      data: {
        draftConfig: customizationRepo.jsonInput(config),
        draftVersion: { increment: 1 },
        updatedById: context.session.userId,
        draftOrigin: 'SUPER_ADMIN_UI',
        draftSourceRevisionId: null,
      },
    });
    if (updated.count !== 1) {
      throw new ConflictError('O rascunho foi alterado durante o salvamento.');
    }

    await tx.auditLog.create({
      data: {
        tenantId,
        storeId,
        userId: context.session.userId,
        action: 'CUSTOMIZATION_DRAFT_SAVED',
        entity: 'StoreCustomization',
        entityId: customization.id,
        metadata: {
          previousDraftVersion: customization.draftVersion,
          nextDraftVersion,
          changedSections: changed,
        },
      },
    });
  });

  return { draftVersion: nextDraftVersion, changedSections: changed };
}

export async function discardCustomizationDraft(
  tenantId: string,
  storeId: string,
  expectedDraftVersion: unknown,
) {
  const version = parseVersion(expectedDraftVersion);
  const { context, customization } = await ensureScopedCustomization(tenantId, storeId);
  assertExpectedVersion(customization.draftVersion, version.expectedDraftVersion);
  const nextDraftVersion = customization.draftVersion + 1;

  await getDb().$transaction(async (tx) => {
    const updated = await tx.storeCustomization.updateMany({
      where: {
        id: customization.id,
        tenantId,
        storeId,
        draftVersion: version.expectedDraftVersion,
      },
      data: {
        draftConfig: Prisma.DbNull,
        draftVersion: { increment: 1 },
        updatedById: context.session.userId,
        draftOrigin: null,
        draftSourceRevisionId: null,
      },
    });
    if (updated.count !== 1) throw new ConflictError('O rascunho foi alterado durante o descarte.');

    await tx.auditLog.create({
      data: {
        tenantId,
        storeId,
        userId: context.session.userId,
        action: 'CUSTOMIZATION_DRAFT_DISCARDED',
        entity: 'StoreCustomization',
        entityId: customization.id,
        metadata: { previousDraftVersion: customization.draftVersion, nextDraftVersion },
      },
    });
  });

  return { draftVersion: nextDraftVersion };
}

export async function publishCustomization(
  tenantId: string,
  storeId: string,
  input: { expectedDraftVersion: unknown; reason: unknown },
) {
  const publishInput = parsePublishInput(input);
  const { context, customization } = await ensureScopedCustomization(tenantId, storeId);
  assertExpectedVersion(customization.draftVersion, publishInput.expectedDraftVersion);
  if (!customization.draftConfig) {
    throw new ValidationError('Não existe rascunho para publicar.');
  }

  const config = parseConfig(customization.draftConfig);
  assertBrandingPolicy(config);
  const contrastIssues = evaluateCustomizationContrast(config);
  const criticalIssues = contrastIssues.filter((item) => item.severity === 'error');
  if (criticalIssues.length > 0) {
    throw new ValidationError(
      'Corrija os contrastes críticos antes de publicar.',
      criticalIssues.map((item) => ({
        field: item.pair,
        ratio: item.ratio,
        minimum: item.minimum,
        message: item.message,
      })),
    );
  }

  const previousPublished = parseConfig(customization.publishedConfig);
  const nextPublishedVersion = customization.publishedVersion + 1;
  const nextDraftVersion = customization.draftVersion + 1;
  const publishedAt = new Date();
  const origin: CustomizationRevisionOrigin = customizationRepo.normalizeDraftOrigin(
    customization.draftOrigin,
  );
  const changed = changedSections(previousPublished, config);

  await getDb().$transaction(async (tx) => {
    const updated = await tx.storeCustomization.updateMany({
      where: {
        id: customization.id,
        tenantId,
        storeId,
        draftVersion: publishInput.expectedDraftVersion,
      },
      data: {
        schemaVersion: config.schemaVersion,
        publishedConfig: customizationRepo.jsonInput(config),
        draftConfig: Prisma.DbNull,
        draftVersion: { increment: 1 },
        publishedVersion: { increment: 1 },
        publishedAt,
        publishedById: context.session.userId,
        updatedById: context.session.userId,
        draftOrigin: null,
        draftSourceRevisionId: null,
      },
    });
    if (updated.count !== 1) {
      throw new ConflictError('O rascunho foi alterado durante a publicação.');
    }

    await tx.storeCustomizationRevision.create({
      data: {
        customizationId: customization.id,
        tenantId,
        storeId,
        version: nextPublishedVersion,
        schemaVersion: config.schemaVersion,
        snapshot: customizationRepo.jsonInput(config),
        actorUserId: context.session.userId,
        action: 'PUBLISHED',
        reason: publishInput.reason,
        origin,
        publishedAt,
      },
    });

    await tx.auditLog.create({
      data: {
        tenantId,
        storeId,
        userId: context.session.userId,
        action: 'CUSTOMIZATION_PUBLISHED',
        entity: 'StoreCustomization',
        entityId: customization.id,
        metadata: {
          previousVersion: customization.publishedVersion,
          nextVersion: nextPublishedVersion,
          reason: publishInput.reason,
          origin,
          changedSections: changed,
        },
      },
    });
  });

  return {
    storeSlug: context.store.slug,
    draftVersion: nextDraftVersion,
    publishedVersion: nextPublishedVersion,
    warnings: contrastIssues.filter((item) => item.severity === 'warning'),
  };
}

async function replaceDraft(
  tenantId: string,
  storeId: string,
  input: { expectedDraftVersion: unknown; reason: unknown },
  config: StoreCustomizationConfig,
  origin: CustomizationRevisionOrigin,
  auditAction: 'CUSTOMIZATION_REVISION_RESTORED' | 'CUSTOMIZATION_DEFAULT_RESTORED',
  metadata: Record<string, string | number | null>,
) {
  const parsedInput = parsePublishInput(input);
  assertBrandingPolicy(config);
  const { context, customization } = await ensureScopedCustomization(tenantId, storeId);
  assertExpectedVersion(customization.draftVersion, parsedInput.expectedDraftVersion);
  const nextDraftVersion = customization.draftVersion + 1;

  await getDb().$transaction(async (tx) => {
    const updated = await tx.storeCustomization.updateMany({
      where: {
        id: customization.id,
        tenantId,
        storeId,
        draftVersion: parsedInput.expectedDraftVersion,
      },
      data: {
        draftConfig: customizationRepo.jsonInput(config),
        draftVersion: { increment: 1 },
        updatedById: context.session.userId,
        draftOrigin: origin,
        draftSourceRevisionId:
          typeof metadata.sourceRevisionId === 'string' ? metadata.sourceRevisionId : null,
      },
    });
    if (updated.count !== 1)
      throw new ConflictError('O rascunho foi alterado durante a restauração.');

    await tx.auditLog.create({
      data: {
        tenantId,
        storeId,
        userId: context.session.userId,
        action: auditAction,
        entity: 'StoreCustomization',
        entityId: customization.id,
        metadata: {
          ...metadata,
          reason: parsedInput.reason,
          previousDraftVersion: customization.draftVersion,
          nextDraftVersion,
        },
      },
    });
  });

  return { draftVersion: nextDraftVersion };
}

export async function restoreCustomizationRevision(
  tenantId: string,
  storeId: string,
  revisionId: string,
  input: { expectedDraftVersion: unknown; reason: unknown },
) {
  await requireSuperAdminStoreAccess(tenantId, storeId);
  const revision = await customizationRepo.findRevision(tenantId, storeId, revisionId);
  if (!revision) throw new NotFoundError('Revisão', revisionId);
  const config = parseConfig(revision.snapshot);

  return replaceDraft(
    tenantId,
    storeId,
    input,
    config,
    'RESTORE',
    'CUSTOMIZATION_REVISION_RESTORED',
    {
      sourceRevisionId: revision.id,
      sourceVersion: revision.version,
    },
  );
}

export async function restoreDefaultCustomization(
  tenantId: string,
  storeId: string,
  input: { expectedDraftVersion: unknown; reason: unknown },
) {
  return replaceDraft(
    tenantId,
    storeId,
    input,
    createDefaultCustomization(),
    'SYSTEM_DEFAULT',
    'CUSTOMIZATION_DEFAULT_RESTORED',
    { sourceRevisionId: null },
  );
}

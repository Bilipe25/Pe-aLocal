import { Prisma, type CustomizationRevisionOrigin } from '@prisma/client';

import {
  createDefaultCustomization,
  evaluateCustomizationContrast,
} from '@/features/customization/domain';
import { assertCustomizationEntitlement } from '@/features/customization/entitlements';
import {
  customizationPublishSchema,
  customizationVersionSchema,
  storeCustomizationConfigSchema,
  type StoreCustomizationConfig,
} from '@/schemas/customization';
import { storeEntitlementInputSchema } from '@/schemas/store-entitlement';
import { requireSuperAdminStoreAccess } from '@/server/auth';
import { getDb } from '@/server/database/client';
import { ConflictError, NotFoundError, ValidationError } from '@/server/errors';
import { storeAssetUrl } from '@/features/assets/urls';
import * as customizationRepo from '@/server/repositories/store-customization.repository';
import * as assetRepo from '@/server/repositories/store-asset.repository';
import * as bannerRepo from '@/server/repositories/store-banner.repository';
import * as domainRepo from '@/server/repositories/store-domain.repository';
import { ensureStoreEntitlement } from '@/server/repositories/store-entitlement.repository';

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

async function assertCustomizationPolicy(
  tenantId: string,
  storeId: string,
  storeSlug: string,
  config: StoreCustomizationConfig,
) {
  const entitlement = await ensureStoreEntitlement(tenantId, storeId);
  assertCustomizationEntitlement(config, entitlement);

  if (!config.seo.canonicalUrl) return;
  const canonical = new URL(config.seo.canonicalUrl);
  if (canonical.protocol !== 'https:') {
    throw new ValidationError('A URL canônica deve usar HTTPS.');
  }
  const activeDomain = await domainRepo.findActiveStoreDomainByHostname(
    tenantId,
    storeId,
    canonical.hostname.toLowerCase(),
  );
  if (
    activeDomain &&
    ['/', `/${storeSlug}`, `/${storeSlug}/`].includes(canonical.pathname) &&
    !canonical.search &&
    !canonical.hash
  ) {
    return;
  }

  const appUrl = process.env.APP_URL ? new URL(process.env.APP_URL) : null;
  const expectedPath = `/${storeSlug}`;
  if (
    !appUrl ||
    canonical.hostname.toLowerCase() !== appUrl.hostname.toLowerCase() ||
    ![expectedPath, `${expectedPath}/`].includes(canonical.pathname) ||
    Boolean(canonical.search) ||
    Boolean(canonical.hash)
  ) {
    throw new ValidationError(
      'A URL canônica deve usar a rota oficial da loja ou um domínio ativo associado a ela.',
    );
  }
}

async function assertAssetReferences(
  tenantId: string,
  storeId: string,
  config: StoreCustomizationConfig,
) {
  const references = [
    { id: config.identity.logoAssetId, type: 'LOGO' },
    { id: config.identity.logoDarkAssetId, type: 'LOGO_DARK' },
    { id: config.identity.coverAssetId, type: 'COVER' },
    { id: config.identity.faviconAssetId, type: 'FAVICON' },
    { id: config.identity.socialImageAssetId, type: 'SOCIAL_IMAGE' },
  ].filter((item): item is { id: string; type: typeof item.type } => Boolean(item.id));
  if (references.length === 0) return;

  const assets = await getDb().storeAsset.findMany({
    where: {
      id: { in: references.map((item) => item.id) },
      tenantId,
      storeId,
      status: 'ACTIVE',
      deletedAt: null,
    },
    select: { id: true, assetType: true },
  });
  const typeById = new Map(assets.map((asset) => [asset.id, asset.assetType]));
  const invalid = references.find((reference) => typeById.get(reference.id) !== reference.type);
  if (invalid) {
    throw new ValidationError(
      'A personalização referencia um asset ausente, de outro estabelecimento ou do tipo incorreto.',
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
  const [revisions, assets, banners, domains, entitlement, categories, products, coupons] =
    await Promise.all([
    customizationRepo.listRevisions(tenantId, storeId),
    assetRepo.listActiveStoreAssets(tenantId, storeId),
      bannerRepo.listAdminStoreBanners(tenantId, storeId),
      domainRepo.listAdminStoreDomains(tenantId, storeId),
      ensureStoreEntitlement(tenantId, storeId),
      getDb().category.findMany({
        where: { tenantId, storeId, isActive: true },
        orderBy: { name: 'asc' },
        select: { id: true, name: true },
      }),
      getDb().product.findMany({
        where: { tenantId, storeId, isAvailable: true },
        orderBy: { name: 'asc' },
        select: { id: true, name: true },
      }),
      getDb().coupon.findMany({
        where: { tenantId, isActive: true },
        orderBy: { code: 'asc' },
        select: { id: true, code: true },
      }),
    ]);
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
    assets: assets.map((asset) => ({
      ...asset,
      url: storeAssetUrl(asset.id),
      previewUrl: storeAssetUrl(asset.id, 384),
    })),
    banners: banners.map((banner) => ({
      ...banner,
      imageUrl: banner.asset ? storeAssetUrl(banner.asset.id, 1280) : null,
    })),
    domains,
    entitlement: storeEntitlementInputSchema.parse(entitlement),
    destinations: { categories, products, coupons },
  };
}

export async function saveCustomizationDraft(
  tenantId: string,
  storeId: string,
  input: { config: unknown; expectedDraftVersion: unknown },
) {
  const { context, customization } = await ensureScopedCustomization(tenantId, storeId);
  const config = parseConfig(input.config);
  await assertCustomizationPolicy(tenantId, storeId, context.store.slug, config);
  await assertAssetReferences(tenantId, storeId, config);
  const version = parseVersion(input.expectedDraftVersion);
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
        draftOrigin: customization.draftOrigin ?? 'SUPER_ADMIN_UI',
        draftSourceRevisionId: customization.draftSourceRevisionId,
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
  const { context, customization } = await ensureScopedCustomization(tenantId, storeId);
  const version = parseVersion(expectedDraftVersion);
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
  const { context, customization } = await ensureScopedCustomization(tenantId, storeId);
  const publishInput = parsePublishInput(input);
  assertExpectedVersion(customization.draftVersion, publishInput.expectedDraftVersion);
  if (!customization.draftConfig) {
    throw new ValidationError('Não existe rascunho para publicar.');
  }

  const config = parseConfig(customization.draftConfig);
  await assertCustomizationPolicy(tenantId, storeId, context.store.slug, config);
  await assertAssetReferences(tenantId, storeId, config);
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
    if (
      previousPublished.platformBranding.showPedidoLocalBranding !==
      config.platformBranding.showPedidoLocalBranding
    ) {
      await tx.auditLog.create({
        data: {
          tenantId,
          storeId,
          userId: context.session.userId,
          action: 'BRANDING_VISIBILITY_CHANGED',
          entity: 'StoreCustomization',
          entityId: customization.id,
          metadata: {
            previousVisible: previousPublished.platformBranding.showPedidoLocalBranding,
            nextVisible: config.platformBranding.showPedidoLocalBranding,
            publishedVersion: nextPublishedVersion,
          },
        },
      });
    }
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
  const { context, customization } = await ensureScopedCustomization(tenantId, storeId);
  const parsedInput = parsePublishInput(input);
  await assertCustomizationPolicy(tenantId, storeId, context.store.slug, config);
  await assertAssetReferences(tenantId, storeId, config);
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

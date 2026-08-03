import 'server-only';

import { Prisma, type AuditAction, type StoreStatus } from '@prisma/client';
import { z } from 'zod';

import { maskPixKey, normalizeSlug, validatePixKey } from '@/lib/brazil';
import {
  createScheduleExceptionSchema,
  expectedConfigurationVersionSchema,
  updateAddressSchema,
  updateHoursSchema,
  updateStoreOperationalSettingsSchema,
  updateStorePaymentSettingsSchema,
  updateStoreSchema,
  updateStorefrontDisplaySchema,
} from '@/schemas/store';
import { requireTenantStoreAccess } from '@/server/auth';
import { getDb } from '@/server/database/client';
import {
  AuthorizationError,
  BusinessRuleError,
  ConflictError,
  TenantAccessError,
  ValidationError,
} from '@/server/errors';
import { hasTenantPermission, Permission, type TenantRole } from '@/server/permissions';
import * as auditRepo from '@/server/repositories/audit-log.repository';
import * as storeRepo from '@/server/repositories/store.repository';
import { getStoreAvailabilityStateForTenant } from '@/server/services/store-availability.service';
import { getStoreReadinessStateForTenant } from '@/server/services/store-readiness.service';

const CONFIGURATION_CONFLICT_MESSAGE =
  'As configurações foram alteradas em outra sessão. Recarregue a página antes de continuar.';

type RawFormInput = FormData | Record<string, unknown>;

export interface StoreConfigurationMutationResult {
  storeId: string;
  configurationVersion: number;
  storeSlug: string;
  previousStoreSlug?: string;
}

export interface StorePageCapabilities {
  viewGeneral: boolean;
  editGeneral: boolean;
  viewAddress: boolean;
  editAddress: boolean;
  viewHours: boolean;
  editHours: boolean;
  viewOperations: boolean;
  editOperations: boolean;
  viewDisplay: boolean;
  editDisplay: boolean;
  viewPayments: boolean;
  editPayments: boolean;
  changeStatus: boolean;
}

export function getStorePageCapabilities(role: TenantRole): StorePageCapabilities {
  return {
    viewGeneral: hasTenantPermission(role, Permission.VIEW_STORE_GENERAL),
    editGeneral: hasTenantPermission(role, Permission.EDIT_STORE_GENERAL),
    viewAddress: hasTenantPermission(role, Permission.VIEW_STORE_ADDRESS),
    editAddress: hasTenantPermission(role, Permission.EDIT_STORE_ADDRESS),
    viewHours: hasTenantPermission(role, Permission.VIEW_STORE_HOURS),
    editHours: hasTenantPermission(role, Permission.EDIT_STORE_HOURS),
    viewOperations: hasTenantPermission(role, Permission.VIEW_STORE_OPERATIONS),
    editOperations: hasTenantPermission(role, Permission.EDIT_STORE_OPERATIONS),
    viewDisplay: hasTenantPermission(role, Permission.VIEW_STOREFRONT_DISPLAY),
    editDisplay: hasTenantPermission(role, Permission.EDIT_STOREFRONT_DISPLAY),
    viewPayments: hasTenantPermission(role, Permission.VIEW_PAYMENT_SETTINGS),
    editPayments: hasTenantPermission(role, Permission.EDIT_PAYMENT_SETTINGS),
    changeStatus: hasTenantPermission(role, Permission.CHANGE_STORE_STATUS),
  };
}

function missingStore(): never {
  throw new TenantAccessError('A loja não pertence ao estabelecimento autenticado.');
}

function asRecord(input: RawFormInput): Record<string, unknown> {
  return input instanceof FormData ? Object.fromEntries(input) : input;
}

function parseInput<T>(schema: z.ZodType<T>, input: unknown, message: string): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(
      message,
      parsed.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
    );
  }
  return parsed.data;
}

function parseExpectedConfigurationVersion(value: unknown): number {
  return parseInput(
    expectedConfigurationVersionSchema,
    value,
    'A versão das configurações é inválida.',
  );
}

function changedFields(
  before: Record<string, unknown> | null,
  after: Record<string, unknown>,
): string[] {
  return Object.keys(after).filter(
    (field) => JSON.stringify(before?.[field] ?? null) !== JSON.stringify(after[field] ?? null),
  );
}

async function advanceConfigurationVersion(
  tx: Prisma.TransactionClient,
  storeId: string,
  tenantId: string,
  expectedConfigurationVersion: number,
  data: Prisma.StoreUpdateManyMutationInput = {},
) {
  const updated = await tx.store.updateMany({
    where: {
      id: storeId,
      tenantId,
      configurationVersion: expectedConfigurationVersion,
    },
    data: {
      ...data,
      configurationVersion: { increment: 1 },
    },
  });

  if (updated.count !== 1) {
    throw new ConflictError(CONFIGURATION_CONFLICT_MESSAGE);
  }
}

async function writeStoreAudit(
  tx: Prisma.TransactionClient,
  input: {
    tenantId: string;
    storeId: string;
    userId: string;
    action?: AuditAction;
    section: string;
    expectedConfigurationVersion: number;
    metadata: Prisma.InputJsonObject;
  },
) {
  return auditRepo.createAuditLog(
    {
      tenantId: input.tenantId,
      storeId: input.storeId,
      userId: input.userId,
      action: input.action ?? 'UPDATE',
      entity: 'Store',
      entityId: input.storeId,
      metadata: {
        section: input.section,
        previousConfigurationVersion: input.expectedConfigurationVersion,
        nextConfigurationVersion: input.expectedConfigurationVersion + 1,
        ...input.metadata,
      },
    },
    tx,
  );
}

export async function getStoreOverview(storeId: string) {
  const { session } = await requireTenantStoreAccess(storeId, Permission.VIEW_STORE_OVERVIEW);
  const [storeRecord, state] = await Promise.all([
    storeRepo.findStoreOverviewById(storeId, session.tenantId),
    getStoreAvailabilityStateForTenant(session.tenantId, storeId),
  ]);
  if (!storeRecord) missingStore();

  const { _count, ...store } = storeRecord;

  return {
    store,
    summary: {
      categoryCount: _count.categories,
      productCount: _count.products,
      deliveryZoneCount: _count.deliveryZones,
      activeHourCount: store.openingHours.length,
      hasAddress: Boolean(store.address),
    },
    readiness: state.readiness,
    availability: state.availability,
    capabilities: getStorePageCapabilities(session.tenantRole),
  };
}

export async function getStoreGeneralSettings(storeId: string) {
  const { session } = await requireTenantStoreAccess(storeId, Permission.VIEW_STORE_GENERAL);
  const store = await storeRepo.findStoreGeneralSettingsById(storeId, session.tenantId);
  if (!store) missingStore();

  return {
    store,
    canEdit: hasTenantPermission(session.tenantRole, Permission.EDIT_STORE_GENERAL),
  };
}

export async function getStoreAddressSettings(storeId: string) {
  const { session } = await requireTenantStoreAccess(storeId, Permission.VIEW_STORE_ADDRESS);
  const store = await storeRepo.findStoreAddressSettingsById(storeId, session.tenantId);
  if (!store) missingStore();

  return {
    store,
    canEdit: hasTenantPermission(session.tenantRole, Permission.EDIT_STORE_ADDRESS),
  };
}

export async function getStoreHoursSettings(storeId: string) {
  const { session } = await requireTenantStoreAccess(storeId, Permission.VIEW_STORE_HOURS);
  const [store, availabilityState] = await Promise.all([
    storeRepo.findStoreHoursSettingsById(storeId, session.tenantId),
    getStoreAvailabilityStateForTenant(session.tenantId, storeId),
  ]);
  if (!store) missingStore();

  return {
    store,
    canEdit: hasTenantPermission(session.tenantRole, Permission.EDIT_STORE_HOURS),
    canEditTimeZone: session.tenantRole === 'OWNER',
    availability: availabilityState.availability,
  };
}

export async function getStoreOperationalSettings(storeId: string) {
  const { session } = await requireTenantStoreAccess(storeId, Permission.VIEW_STORE_OPERATIONS);
  const store = await storeRepo.findStoreOperationalSettingsById(storeId, session.tenantId);
  if (!store) missingStore();

  const settings = store.settings;
  const paymentSummary = {
    acceptsPix: settings?.acceptsPix ?? false,
    acceptsCash: settings?.acceptsCash ?? false,
    acceptsCardOnDelivery: settings?.acceptsCardOnDelivery ?? false,
    pixConfigured: Boolean(
      settings?.pixKeyType &&
      settings.pixKey &&
      validatePixKey(settings.pixKeyType, settings.pixKey),
    ),
  };

  return {
    store: {
      id: store.id,
      status: store.status,
      configurationVersion: store.configurationVersion,
      settings: settings
        ? {
            minOrderValue: settings.minOrderValue,
            estimatedTime: settings.estimatedTime,
            estimatedTimeMinMinutes: settings.estimatedTimeMinMinutes,
            estimatedTimeMaxMinutes: settings.estimatedTimeMaxMinutes,
            deliveryEnabled: settings.deliveryEnabled,
            pickupEnabled: settings.pickupEnabled,
          }
        : null,
      hasActiveDeliveryZone: store.deliveryZones.length > 0,
      paymentSummary,
    },
    canEdit: hasTenantPermission(session.tenantRole, Permission.EDIT_STORE_OPERATIONS),
    canViewPayments: hasTenantPermission(session.tenantRole, Permission.VIEW_PAYMENT_SETTINGS),
  };
}

export async function getStorefrontDisplaySettings(storeId: string) {
  const { session } = await requireTenantStoreAccess(storeId, Permission.VIEW_STOREFRONT_DISPLAY);
  const store = await storeRepo.findStorefrontDisplaySettingsById(storeId, session.tenantId);
  if (!store) missingStore();

  return {
    store,
    canEdit: hasTenantPermission(session.tenantRole, Permission.EDIT_STOREFRONT_DISPLAY),
  };
}

export async function getStorePaymentSettings(storeId: string) {
  const { session } = await requireTenantStoreAccess(storeId, Permission.VIEW_PAYMENT_SETTINGS);
  const store = await storeRepo.findStorePaymentSettingsById(storeId, session.tenantId);
  if (!store) missingStore();

  return {
    store: {
      id: store.id,
      configurationVersion: store.configurationVersion,
      settings: store.settings
        ? (() => {
            const { pixKey, ...safeSettings } = store.settings;
            return {
              ...safeSettings,
              hasPixKey: Boolean(pixKey),
              hasValidPixConfiguration: Boolean(
                store.settings.pixKeyType &&
                pixKey &&
                validatePixKey(store.settings.pixKeyType, pixKey),
              ),
              pixKeyMasked: maskPixKey(store.settings.pixKeyType, pixKey),
            };
          })()
        : null,
    },
    canEdit: hasTenantPermission(session.tenantRole, Permission.EDIT_PAYMENT_SETTINGS),
  };
}

export async function updateStoreGeneralSettings(
  storeId: string,
  expectedVersion: unknown,
  input: RawFormInput,
): Promise<StoreConfigurationMutationResult> {
  const { session, store } = await requireTenantStoreAccess(storeId, Permission.EDIT_STORE_GENERAL);
  const configurationVersion = parseExpectedConfigurationVersion(expectedVersion);
  const raw = asRecord(input);
  const parsed = parseInput(
    updateStoreSchema,
    { ...raw, slug: normalizeSlug(String(raw.slug ?? '')) },
    'Os dados gerais da loja são inválidos.',
  );
  const generalData = {
    name: parsed.name,
    slug: parsed.slug,
    description: parsed.description,
    phone: parsed.phone,
    whatsapp: parsed.whatsapp,
  };
  let previousStoreSlug = store.slug;

  try {
    await getDb().$transaction(async (tx) => {
      const previous = await tx.store.findFirst({
        where: { id: store.id, tenantId: session.tenantId, configurationVersion },
        select: {
          name: true,
          slug: true,
          description: true,
          phone: true,
          whatsapp: true,
        },
      });
      if (!previous) throw new ConflictError(CONFIGURATION_CONFLICT_MESSAGE);
      previousStoreSlug = previous.slug;

      const slugChanged = generalData.slug !== previous.slug;
      if (slugChanged) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${generalData.slug}))`;

        const [storeUsingSlug, redirectUsingSlug] = await Promise.all([
          tx.store.findUnique({
            where: { slug: generalData.slug },
            select: { id: true },
          }),
          tx.storeSlugRedirect.findUnique({
            where: { oldSlug: generalData.slug },
            select: { storeId: true },
          }),
        ]);

        if (storeUsingSlug && storeUsingSlug.id !== store.id) {
          throw new ConflictError('Este slug já está em uso.');
        }
        if (redirectUsingSlug && redirectUsingSlug.storeId !== store.id) {
          throw new ConflictError('Este slug já está em uso.');
        }

        if (redirectUsingSlug?.storeId === store.id) {
          await tx.storeSlugRedirect.delete({
            where: { oldSlug: generalData.slug },
          });
        }
      }

      await advanceConfigurationVersion(
        tx,
        store.id,
        session.tenantId,
        configurationVersion,
        generalData,
      );

      if (slugChanged) {
        await tx.storeSlugRedirect.upsert({
          where: { oldSlug: previous.slug },
          update: {
            tenantId: session.tenantId,
            storeId: store.id,
            createdById: session.userId,
          },
          create: {
            tenantId: session.tenantId,
            storeId: store.id,
            oldSlug: previous.slug,
            createdById: session.userId,
          },
        });
      }

      await writeStoreAudit(tx, {
        tenantId: session.tenantId,
        storeId: store.id,
        userId: session.userId,
        section: 'general',
        expectedConfigurationVersion: configurationVersion,
        metadata: {
          changedFields: changedFields(previous, generalData),
          previousPublicIdentity: { name: previous.name, slug: previous.slug },
          nextPublicIdentity: { name: generalData.name, slug: generalData.slug },
          slugRedirectCreated: slugChanged ? previous.slug : null,
        },
      });
    });
  } catch (error) {
    if (typeof error === 'object' && error && 'code' in error && error.code === 'P2002') {
      throw new ConflictError('Este slug já está em uso.');
    }
    throw error;
  }

  return {
    storeId: store.id,
    configurationVersion: configurationVersion + 1,
    storeSlug: generalData.slug,
    previousStoreSlug,
  };
}

export async function updateStoreOperationalSettings(
  storeId: string,
  expectedVersion: unknown,
  input: RawFormInput,
): Promise<StoreConfigurationMutationResult> {
  const { session, store } = await requireTenantStoreAccess(
    storeId,
    Permission.EDIT_STORE_OPERATIONS,
  );
  const configurationVersion = parseExpectedConfigurationVersion(expectedVersion);
  const parsed = parseInput(
    updateStoreOperationalSettingsSchema,
    asRecord(input),
    'As configurações operacionais são inválidas.',
  );
  const settingsData = {
    ...parsed,
    minOrderValue: Math.round(parsed.minOrderValue * 100),
    estimatedTime: `${parsed.estimatedTimeMinMinutes}-${parsed.estimatedTimeMaxMinutes} min`,
  };

  await getDb().$transaction(async (tx) => {
    const currentStore = await tx.store.findFirst({
      where: { id: store.id, tenantId: session.tenantId, configurationVersion },
      select: { status: true },
    });
    if (!currentStore) throw new ConflictError(CONFIGURATION_CONFLICT_MESSAGE);

    const previous = await tx.storeSettings.findUnique({
      where: { storeId: store.id },
      select: {
        minOrderValue: true,
        estimatedTime: true,
        estimatedTimeMinMinutes: true,
        estimatedTimeMaxMinutes: true,
        deliveryEnabled: true,
        pickupEnabled: true,
      },
    });

    if (
      currentStore.status === 'OPEN' &&
      settingsData.deliveryEnabled &&
      !settingsData.pickupEnabled
    ) {
      const activeDeliveryZoneCount = await tx.deliveryZone.count({
        where: {
          tenantId: session.tenantId,
          storeId: store.id,
          isActive: true,
          postalRanges: { some: { isActive: true } },
        },
      });
      if (activeDeliveryZoneCount === 0) {
        throw new BusinessRuleError(
          'A loja aberta precisa manter ao menos uma modalidade disponível.',
          [
            {
              field: 'deliveryEnabled',
              message: 'Cadastre uma região de entrega ativa ou mantenha a retirada habilitada.',
            },
          ],
        );
      }
    }

    const previousValues = previous
      ? {
          minOrderValue: previous.minOrderValue,
          estimatedTime: previous.estimatedTime,
          estimatedTimeMinMinutes: previous.estimatedTimeMinMinutes,
          estimatedTimeMaxMinutes: previous.estimatedTimeMaxMinutes,
          deliveryEnabled: previous.deliveryEnabled,
          pickupEnabled: previous.pickupEnabled,
        }
      : null;
    await advanceConfigurationVersion(tx, store.id, session.tenantId, configurationVersion);
    await tx.storeSettings.upsert({
      where: { storeId: store.id },
      update: settingsData,
      create: { storeId: store.id, ...settingsData },
    });
    await writeStoreAudit(tx, {
      tenantId: session.tenantId,
      storeId: store.id,
      userId: session.userId,
      section: 'operations',
      expectedConfigurationVersion: configurationVersion,
      metadata: {
        changedFields: changedFields(previousValues, settingsData),
        previousValues,
        nextValues: settingsData,
      },
    });
  });

  return {
    storeId: store.id,
    configurationVersion: configurationVersion + 1,
    storeSlug: store.slug,
  };
}

export async function updateStorefrontDisplaySettings(
  storeId: string,
  expectedVersion: unknown,
  input: RawFormInput,
): Promise<StoreConfigurationMutationResult> {
  const { session, store } = await requireTenantStoreAccess(
    storeId,
    Permission.EDIT_STOREFRONT_DISPLAY,
  );
  const configurationVersion = parseExpectedConfigurationVersion(expectedVersion);
  const settingsData = parseInput(
    updateStorefrontDisplaySchema,
    asRecord(input),
    'As preferências de exibição são inválidas.',
  );

  await getDb().$transaction(async (tx) => {
    const previous = await tx.storeSettings.findUnique({
      where: { storeId: store.id },
      select: {
        showEstimatedTimeInHero: true,
        showFulfillmentInHero: true,
        showMinOrderValueInHero: true,
        showOpeningHoursInHero: true,
        showFullAddressInStoreInfo: true,
        showRecentPurchasesSection: true,
        showFeaturedProductsSection: true,
      },
    });

    await advanceConfigurationVersion(tx, store.id, session.tenantId, configurationVersion);
    await tx.storeSettings.upsert({
      where: { storeId: store.id },
      update: settingsData,
      create: { storeId: store.id, ...settingsData },
    });
    await writeStoreAudit(tx, {
      tenantId: session.tenantId,
      storeId: store.id,
      userId: session.userId,
      action: 'STOREFRONT_DISPLAY_UPDATED',
      section: 'storefront-display',
      expectedConfigurationVersion: configurationVersion,
      metadata: {
        changedFields: changedFields(previous, settingsData),
        previousValues: previous,
        nextValues: settingsData,
      },
    });
  });

  return {
    storeId: store.id,
    configurationVersion: configurationVersion + 1,
    storeSlug: store.slug,
  };
}

export async function updateStorePaymentSettings(
  storeId: string,
  expectedVersion: unknown,
  input: RawFormInput,
): Promise<StoreConfigurationMutationResult> {
  const { session, store } = await requireTenantStoreAccess(
    storeId,
    Permission.EDIT_PAYMENT_SETTINGS,
  );
  const configurationVersion = parseExpectedConfigurationVersion(expectedVersion);
  const parsed = parseInput(
    updateStorePaymentSettingsSchema,
    asRecord(input),
    'As configurações de pagamento são inválidas.',
  );

  await getDb().$transaction(async (tx) => {
    const previous = await tx.storeSettings.findUnique({
      where: { storeId: store.id },
      select: {
        acceptsPix: true,
        acceptsCash: true,
        acceptsCardOnDelivery: true,
        pixKeyType: true,
        pixKey: true,
        pixRecipient: true,
        pixBank: true,
        pixInstructions: true,
      },
    });

    const preservePixConfiguration = !parsed.acceptsPix && !parsed.replacePixKey;
    const nextPixKeyType = parsed.replacePixKey
      ? parsed.pixKeyType
      : (previous?.pixKeyType ?? null);
    const nextPixKey = parsed.replacePixKey ? parsed.pixKey : (previous?.pixKey ?? null);
    const nextPixRecipient = preservePixConfiguration
      ? (previous?.pixRecipient ?? null)
      : parsed.pixRecipient || null;
    const nextPixBank = preservePixConfiguration
      ? (previous?.pixBank ?? null)
      : parsed.pixBank || null;
    const nextPixInstructions = preservePixConfiguration
      ? (previous?.pixInstructions ?? null)
      : parsed.pixInstructions || null;

    if (
      parsed.acceptsPix &&
      (!nextPixKeyType || !nextPixKey || !validatePixKey(nextPixKeyType, nextPixKey))
    ) {
      throw new BusinessRuleError('Configure uma chave Pix válida antes de habilitar o Pix.', [
        { field: 'pixKey', message: 'Informe ou substitua a chave Pix desta unidade.' },
      ]);
    }

    const settingsData = {
      acceptsPix: parsed.acceptsPix,
      acceptsCash: parsed.acceptsCash,
      acceptsCardOnDelivery: parsed.acceptsCardOnDelivery,
      pixKeyType: nextPixKeyType,
      pixKey: nextPixKey || null,
      pixRecipient: nextPixRecipient,
      pixBank: nextPixBank,
      pixInstructions: nextPixInstructions,
    };
    const previousSafe = previous
      ? {
          acceptsPix: previous.acceptsPix,
          acceptsCash: previous.acceptsCash,
          acceptsCardOnDelivery: previous.acceptsCardOnDelivery,
          pixKeyType: previous.pixKeyType,
          pixKeyMasked: maskPixKey(previous.pixKeyType, previous.pixKey),
          pixRecipientConfigured: Boolean(previous.pixRecipient),
          pixBankConfigured: Boolean(previous.pixBank),
          pixInstructionsConfigured: Boolean(previous.pixInstructions),
        }
      : null;
    const nextSafe = {
      acceptsPix: settingsData.acceptsPix,
      acceptsCash: settingsData.acceptsCash,
      acceptsCardOnDelivery: settingsData.acceptsCardOnDelivery,
      pixKeyType: settingsData.pixKeyType,
      pixKeyMasked: maskPixKey(settingsData.pixKeyType, settingsData.pixKey),
      pixRecipientConfigured: Boolean(settingsData.pixRecipient),
      pixBankConfigured: Boolean(settingsData.pixBank),
      pixInstructionsConfigured: Boolean(settingsData.pixInstructions),
    };

    await advanceConfigurationVersion(tx, store.id, session.tenantId, configurationVersion);
    await tx.storeSettings.upsert({
      where: { storeId: store.id },
      update: settingsData,
      create: { storeId: store.id, ...settingsData },
    });
    await writeStoreAudit(tx, {
      tenantId: session.tenantId,
      storeId: store.id,
      userId: session.userId,
      section: 'payments',
      expectedConfigurationVersion: configurationVersion,
      metadata: {
        changedFields: changedFields(previousSafe, nextSafe),
        previousPixKeyType: previous?.pixKeyType ?? null,
        nextPixKeyType: settingsData.pixKeyType,
        previousPixKeyMasked: maskPixKey(previous?.pixKeyType ?? null, previous?.pixKey ?? null),
        nextPixKeyMasked: nextSafe.pixKeyMasked,
        pixKeyChanged: (previous?.pixKey ?? null) !== settingsData.pixKey,
        pixRecipientChanged: (previous?.pixRecipient ?? null) !== settingsData.pixRecipient,
        pixBankChanged: (previous?.pixBank ?? null) !== settingsData.pixBank,
        pixInstructionsChanged:
          (previous?.pixInstructions ?? null) !== settingsData.pixInstructions,
      },
    });
  });

  return {
    storeId: store.id,
    configurationVersion: configurationVersion + 1,
    storeSlug: store.slug,
  };
}

export async function removeStorePixConfiguration(
  storeId: string,
  expectedVersion: unknown,
): Promise<StoreConfigurationMutationResult> {
  const { session, store } = await requireTenantStoreAccess(
    storeId,
    Permission.EDIT_PAYMENT_SETTINGS,
  );
  const configurationVersion = parseExpectedConfigurationVersion(expectedVersion);

  await getDb().$transaction(async (tx) => {
    const previous = await tx.storeSettings.findUnique({
      where: { storeId: store.id },
      select: {
        acceptsPix: true,
        acceptsCash: true,
        acceptsCardOnDelivery: true,
        pixKeyType: true,
        pixKey: true,
        pixRecipient: true,
        pixBank: true,
        pixInstructions: true,
      },
    });
    if (!previous?.pixKey) {
      throw new BusinessRuleError('Nenhuma chave Pix está configurada nesta unidade.');
    }
    if (!previous.acceptsCash && !previous.acceptsCardOnDelivery) {
      throw new BusinessRuleError('Habilite outra forma de pagamento antes de remover o Pix.', [
        { field: 'acceptsPix', message: 'A loja precisa manter uma forma de pagamento ativa.' },
      ]);
    }

    await advanceConfigurationVersion(tx, store.id, session.tenantId, configurationVersion);
    await tx.storeSettings.upsert({
      where: { storeId: store.id },
      update: {
        acceptsPix: false,
        pixKeyType: null,
        pixKey: null,
        pixRecipient: null,
        pixBank: null,
        pixInstructions: null,
      },
      create: {
        storeId: store.id,
        acceptsPix: false,
        acceptsCash: previous.acceptsCash,
        acceptsCardOnDelivery: previous.acceptsCardOnDelivery,
      },
    });
    await writeStoreAudit(tx, {
      tenantId: session.tenantId,
      storeId: store.id,
      userId: session.userId,
      section: 'payments',
      expectedConfigurationVersion: configurationVersion,
      metadata: {
        changedFields: [
          'acceptsPix',
          'pixKeyType',
          'pixKey',
          'pixRecipient',
          'pixBank',
          'pixInstructions',
        ],
        pixConfigurationRemoved: true,
        previousPixKeyType: previous.pixKeyType,
        previousPixKeyMasked: maskPixKey(previous.pixKeyType, previous.pixKey),
      },
    });
  });

  return {
    storeId: store.id,
    configurationVersion: configurationVersion + 1,
    storeSlug: store.slug,
  };
}

export async function updateStoreAddressSettings(
  storeId: string,
  expectedVersion: unknown,
  input: RawFormInput,
): Promise<StoreConfigurationMutationResult> {
  const { session, store } = await requireTenantStoreAccess(storeId, Permission.EDIT_STORE_ADDRESS);
  const configurationVersion = parseExpectedConfigurationVersion(expectedVersion);
  const parsed = parseInput(updateAddressSchema, asRecord(input), 'O endereço da loja é inválido.');

  await getDb().$transaction(async (tx) => {
    const previous = await tx.storeAddress.findUnique({
      where: { storeId: store.id },
      select: {
        street: true,
        number: true,
        complement: true,
        neighborhood: true,
        city: true,
        state: true,
        zipCode: true,
      },
    });
    await advanceConfigurationVersion(tx, store.id, session.tenantId, configurationVersion);
    await tx.storeAddress.upsert({
      where: { storeId: store.id },
      update: parsed,
      create: { storeId: store.id, ...parsed },
    });
    await writeStoreAudit(tx, {
      tenantId: session.tenantId,
      storeId: store.id,
      userId: session.userId,
      section: 'address',
      expectedConfigurationVersion: configurationVersion,
      metadata: {
        changedFields: changedFields(previous, parsed),
      },
    });
  });

  return {
    storeId: store.id,
    configurationVersion: configurationVersion + 1,
    storeSlug: store.slug,
  };
}

export async function updateStoreHoursSettings(
  storeId: string,
  expectedVersion: unknown,
  input: unknown,
): Promise<StoreConfigurationMutationResult> {
  const { session, store } = await requireTenantStoreAccess(storeId, Permission.EDIT_STORE_HOURS);
  const configurationVersion = parseExpectedConfigurationVersion(expectedVersion);
  const parsed = parseInput(updateHoursSchema, input, 'Os horários da loja são inválidos.');

  if (parsed.timeZone !== store.timeZone && session.tenantRole !== 'OWNER') {
    throw new AuthorizationError('Somente o proprietário pode alterar o fuso horário da loja.');
  }
  if (store.status === 'OPEN' && !parsed.hours.some((hour) => hour.isActive)) {
    throw new BusinessRuleError(
      'Mantenha ao menos um dia ativo enquanto o funcionamento automático estiver habilitado.',
    );
  }

  await getDb().$transaction(async (tx) => {
    const previous = await tx.openingHour.findMany({
      where: { storeId: store.id },
      orderBy: { dayOfWeek: 'asc' },
      select: { dayOfWeek: true, openTime: true, closeTime: true, isActive: true },
    });
    await advanceConfigurationVersion(tx, store.id, session.tenantId, configurationVersion, {
      timeZone: parsed.timeZone,
    });
    for (const hour of parsed.hours) {
      await tx.openingHour.upsert({
        where: { storeId_dayOfWeek: { storeId: store.id, dayOfWeek: hour.dayOfWeek } },
        update: {
          openTime: hour.openTime,
          closeTime: hour.closeTime,
          isActive: hour.isActive,
        },
        create: { storeId: store.id, ...hour },
      });
    }
    await writeStoreAudit(tx, {
      tenantId: session.tenantId,
      storeId: store.id,
      userId: session.userId,
      section: 'hours',
      expectedConfigurationVersion: configurationVersion,
      metadata: {
        previousActiveDays: previous.filter((hour) => hour.isActive).map((hour) => hour.dayOfWeek),
        nextActiveDays: parsed.hours.filter((hour) => hour.isActive).map((hour) => hour.dayOfWeek),
        previousTimeZone: store.timeZone,
        nextTimeZone: parsed.timeZone,
        changedDays: parsed.hours
          .filter((hour) => {
            const old = previous.find((item) => item.dayOfWeek === hour.dayOfWeek);
            return JSON.stringify(old ?? null) !== JSON.stringify(hour);
          })
          .map((hour) => hour.dayOfWeek),
      },
    });
  });

  return {
    storeId: store.id,
    configurationVersion: configurationVersion + 1,
    storeSlug: store.slug,
  };
}

export async function saveStoreScheduleException(
  storeId: string,
  expectedVersion: unknown,
  input: unknown,
): Promise<StoreConfigurationMutationResult> {
  const { session, store } = await requireTenantStoreAccess(storeId, Permission.EDIT_STORE_HOURS);
  const configurationVersion = parseExpectedConfigurationVersion(expectedVersion);
  const parsed = parseInput(
    createScheduleExceptionSchema,
    input,
    'A exceção de calendário é inválida.',
  );
  const date = new Date(`${parsed.date}T00:00:00.000Z`);

  await getDb().$transaction(async (tx) => {
    const previous = await tx.storeScheduleException.findUnique({
      where: { storeId_date: { storeId: store.id, date } },
      select: { id: true, type: true, openTime: true, closeTime: true, reason: true },
    });
    await advanceConfigurationVersion(tx, store.id, session.tenantId, configurationVersion);
    const exception = await tx.storeScheduleException.upsert({
      where: { storeId_date: { storeId: store.id, date } },
      update: {
        type: parsed.type,
        openTime: parsed.type === 'CUSTOM_HOURS' ? parsed.openTime : null,
        closeTime: parsed.type === 'CUSTOM_HOURS' ? parsed.closeTime : null,
        reason: parsed.reason || null,
      },
      create: {
        tenantId: session.tenantId,
        storeId: store.id,
        date,
        type: parsed.type,
        openTime: parsed.type === 'CUSTOM_HOURS' ? parsed.openTime : null,
        closeTime: parsed.type === 'CUSTOM_HOURS' ? parsed.closeTime : null,
        reason: parsed.reason || null,
        createdById: session.userId,
      },
      select: { id: true },
    });
    await auditRepo.createAuditLog(
      {
        tenantId: session.tenantId,
        storeId: store.id,
        userId: session.userId,
        action: previous ? 'UPDATE' : 'CREATE',
        entity: 'StoreScheduleException',
        entityId: exception.id,
        metadata: {
          section: 'schedule-exceptions',
          date: parsed.date,
          previous,
          next: {
            type: parsed.type,
            openTime: parsed.type === 'CUSTOM_HOURS' ? parsed.openTime : null,
            closeTime: parsed.type === 'CUSTOM_HOURS' ? parsed.closeTime : null,
            reason: parsed.reason || null,
          },
          previousConfigurationVersion: configurationVersion,
          nextConfigurationVersion: configurationVersion + 1,
        },
      },
      tx,
    );
  });

  return {
    storeId: store.id,
    configurationVersion: configurationVersion + 1,
    storeSlug: store.slug,
  };
}

export async function removeStoreScheduleException(
  storeId: string,
  expectedVersion: unknown,
  exceptionId: unknown,
): Promise<StoreConfigurationMutationResult> {
  const { session, store } = await requireTenantStoreAccess(storeId, Permission.EDIT_STORE_HOURS);
  const configurationVersion = parseExpectedConfigurationVersion(expectedVersion);
  const id = parseInput(z.string().uuid(), exceptionId, 'A exceção de calendário é inválida.');

  await getDb().$transaction(async (tx) => {
    const exception = await tx.storeScheduleException.findFirst({
      where: { id, tenantId: session.tenantId, storeId: store.id },
      select: { id: true, date: true, type: true, openTime: true, closeTime: true, reason: true },
    });
    if (!exception) missingStore();

    await advanceConfigurationVersion(tx, store.id, session.tenantId, configurationVersion);
    await tx.storeScheduleException.delete({ where: { id: exception.id } });
    await auditRepo.createAuditLog(
      {
        tenantId: session.tenantId,
        storeId: store.id,
        userId: session.userId,
        action: 'DELETE',
        entity: 'StoreScheduleException',
        entityId: exception.id,
        metadata: {
          section: 'schedule-exceptions',
          removed: { ...exception, date: exception.date.toISOString().slice(0, 10) },
          previousConfigurationVersion: configurationVersion,
          nextConfigurationVersion: configurationVersion + 1,
        },
      },
      tx,
    );
  });

  return {
    storeId: store.id,
    configurationVersion: configurationVersion + 1,
    storeSlug: store.slug,
  };
}

export async function updateStoreStatus(
  storeId: string,
  expectedVersion: unknown,
  status: unknown,
): Promise<StoreConfigurationMutationResult> {
  const { session, store } = await requireTenantStoreAccess(
    storeId,
    Permission.CHANGE_STORE_STATUS,
  );
  const configurationVersion = parseExpectedConfigurationVersion(expectedVersion);
  const nextStatus = parseInput(
    z.enum(['OPEN', 'CLOSED', 'PAUSED']),
    status,
    'O status da loja é inválido.',
  ) as StoreStatus;

  const result = await getDb().$transaction(async (tx) => {
    let previousStatus: StoreStatus;

    if (nextStatus === 'OPEN') {
      const { snapshot, readiness } = await getStoreReadinessStateForTenant(
        session.tenantId,
        store.id,
        tx,
      );
      if (snapshot.configurationVersion !== configurationVersion) {
        throw new ConflictError(CONFIGURATION_CONFLICT_MESSAGE);
      }
      previousStatus = snapshot.status;

      if (!readiness.isReady) {
        await auditRepo.createAuditLog(
          {
            tenantId: session.tenantId,
            storeId: store.id,
            userId: session.userId,
            action: 'STATUS_CHANGE',
            entity: 'Store',
            entityId: store.id,
            metadata: {
              section: 'status',
              outcome: 'BLOCKED',
              requestedStatus: nextStatus,
              configurationVersion,
              blockerCodes: readiness.blockers.map((issue) => issue.code),
            },
          },
          tx,
        );
        return { blockedBy: readiness.blockers };
      }
    } else {
      const snapshot = await tx.store.findFirst({
        where: { id: store.id, tenantId: session.tenantId, configurationVersion },
        select: { status: true },
      });
      if (!snapshot) throw new ConflictError(CONFIGURATION_CONFLICT_MESSAGE);
      previousStatus = snapshot.status;
    }

    await advanceConfigurationVersion(tx, store.id, session.tenantId, configurationVersion, {
      status: nextStatus,
    });
    await writeStoreAudit(tx, {
      tenantId: session.tenantId,
      storeId: store.id,
      userId: session.userId,
      action: 'STATUS_CHANGE',
      section: 'status',
      expectedConfigurationVersion: configurationVersion,
      metadata: {
        previousStatus,
        nextStatus,
      },
    });
    return { blockedBy: [] };
  });

  if (result.blockedBy.length > 0) {
    const count = result.blockedBy.length;
    throw new BusinessRuleError(
      `A loja possui ${count} ${count === 1 ? 'pendência que impede' : 'pendências que impedem'} a abertura.`,
      result.blockedBy.map((issue) => ({ ...issue })),
    );
  }

  return {
    storeId: store.id,
    configurationVersion: configurationVersion + 1,
    storeSlug: store.slug,
  };
}

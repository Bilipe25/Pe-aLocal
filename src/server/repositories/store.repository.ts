import { getDb } from '@/server/database/client';

// =============================================================================
// Store Repository
// =============================================================================

export async function listStoreSummariesByTenantId(
  tenantId: string,
  options: { skip?: number; take?: number } = {},
) {
  return getDb().store.findMany({
    where: { tenantId },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    skip: options.skip,
    take: options.take,
    select: {
      id: true,
      tenantId: true,
      name: true,
      slug: true,
      status: true,
      isActive: true,
      createdAt: true,
    },
  });
}

export async function countStoresByTenantId(tenantId: string) {
  return getDb().store.count({ where: { tenantId } });
}

export async function findStoreOverviewById(id: string, tenantId: string) {
  return getDb().store.findFirst({
    where: { id, tenantId },
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      isActive: true,
      configurationVersion: true,
      tenant: { select: { status: true } },
      address: { select: { id: true } },
      openingHours: {
        where: { isActive: true },
        select: { dayOfWeek: true },
      },
    },
  });
}

export async function findStoreGeneralSettingsById(id: string, tenantId: string) {
  return getDb().store.findFirst({
    where: { id, tenantId },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      phone: true,
      whatsapp: true,
      configurationVersion: true,
    },
  });
}

export async function findStoreAddressSettingsById(id: string, tenantId: string) {
  return getDb().store.findFirst({
    where: { id, tenantId },
    select: {
      id: true,
      configurationVersion: true,
      address: {
        select: {
          street: true,
          number: true,
          complement: true,
          neighborhood: true,
          city: true,
          state: true,
          zipCode: true,
        },
      },
    },
  });
}

export async function findStoreHoursSettingsById(id: string, tenantId: string) {
  return getDb().store.findFirst({
    where: { id, tenantId },
    select: {
      id: true,
      configurationVersion: true,
      openingHours: {
        orderBy: { dayOfWeek: 'asc' },
        select: {
          dayOfWeek: true,
          openTime: true,
          closeTime: true,
          isActive: true,
        },
      },
    },
  });
}

export async function findStoreOperationalSettingsById(id: string, tenantId: string) {
  return getDb().store.findFirst({
    where: { id, tenantId },
    select: {
      id: true,
      configurationVersion: true,
      settings: {
        select: {
          minOrderValue: true,
          estimatedTime: true,
          deliveryEnabled: true,
          pickupEnabled: true,
          acceptsPix: true,
          acceptsCash: true,
          acceptsCardOnDelivery: true,
        },
      },
    },
  });
}

export async function findStorePaymentSettingsById(id: string, tenantId: string) {
  return getDb().store.findFirst({
    where: { id, tenantId },
    select: {
      id: true,
      configurationVersion: true,
      settings: {
        select: {
          pixKeyType: true,
          pixKey: true,
          pixRecipient: true,
          pixBank: true,
          pixInstructions: true,
        },
      },
    },
  });
}

/**
 * Confirma o escopo tenant/loja sem carregar configurações operacionais.
 * Usado por operações de plataforma que recebem os dois IDs explicitamente.
 */
export async function findStoreScopeById(id: string, tenantId: string) {
  return getDb().store.findFirst({
    where: { id, tenantId },
    select: {
      id: true,
      tenantId: true,
      name: true,
      slug: true,
      status: true,
      isActive: true,
      configurationVersion: true,
      tenant: {
        select: { id: true, name: true, status: true },
      },
    },
  });
}

export async function findStoreBySlug(slug: string) {
  return getDb().store.findUnique({
    where: { slug },
    select: { id: true, tenantId: true },
  });
}

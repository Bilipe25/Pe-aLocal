import { getDb } from '@/server/database/client';
import type { StoreStatus } from '@prisma/client';

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
    },
  });
}

export async function findStoreAddressSettingsById(id: string, tenantId: string) {
  return getDb().store.findFirst({
    where: { id, tenantId },
    select: {
      id: true,
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

export async function updateStore(
  id: string,
  tenantId: string,
  data: {
    name?: string;
    slug?: string;
    description?: string;
    phone?: string;
    whatsapp?: string;
    status?: StoreStatus;
    logoUrl?: string;
    coverUrl?: string;
  },
) {
  return getDb().store.update({
    where: { id, tenantId },
    data,
  });
}

export async function upsertStoreSettings(
  storeId: string,
  data: {
    primaryColor?: string;
    secondaryColor?: string;
    minOrderValue?: number;
    estimatedTime?: string;
    deliveryEnabled?: boolean;
    pickupEnabled?: boolean;
    acceptsPix?: boolean;
    acceptsCash?: boolean;
    acceptsCardOnDelivery?: boolean;
    pixKeyType?: 'CPF' | 'CNPJ' | 'EMAIL' | 'PHONE' | 'RANDOM' | null;
    pixKey?: string;
    pixRecipient?: string;
    pixBank?: string;
    pixInstructions?: string;
  },
) {
  return getDb().storeSettings.upsert({
    where: { storeId },
    update: data,
    create: { storeId, ...data },
  });
}

export async function upsertStoreAddress(
  storeId: string,
  data: {
    street: string;
    number: string;
    complement?: string;
    neighborhood: string;
    city: string;
    state: string;
    zipCode: string;
  },
) {
  return getDb().storeAddress.upsert({
    where: { storeId },
    update: data,
    create: { storeId, ...data },
  });
}

export async function upsertOpeningHours(
  storeId: string,
  hours: {
    dayOfWeek: 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | 'SUNDAY';
    openTime: string;
    closeTime: string;
    isActive: boolean;
  }[],
) {
  const operations = hours.map((h) =>
    getDb().openingHour.upsert({
      where: { storeId_dayOfWeek: { storeId, dayOfWeek: h.dayOfWeek } },
      update: { openTime: h.openTime, closeTime: h.closeTime, isActive: h.isActive },
      create: {
        storeId,
        dayOfWeek: h.dayOfWeek,
        openTime: h.openTime,
        closeTime: h.closeTime,
        isActive: h.isActive,
      },
    }),
  );
  return getDb().$transaction(operations);
}

import { getDb } from '@/server/database/client';
import type { StoreStatus } from '@prisma/client';

// =============================================================================
// Store Repository
// =============================================================================

export async function findStoreByTenantId(tenantId: string) {
  return getDb().store.findFirst({
    where: { tenantId },
    include: {
      settings: true,
      address: true,
      openingHours: { orderBy: { dayOfWeek: 'asc' } },
    },
  });
}

export async function findStoreById(id: string, tenantId: string) {
  return getDb().store.findFirst({
    where: { id, tenantId },
    include: {
      settings: true,
      address: true,
      openingHours: { orderBy: { dayOfWeek: 'asc' } },
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

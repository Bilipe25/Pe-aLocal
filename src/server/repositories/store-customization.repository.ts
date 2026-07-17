import { Prisma, type CustomizationRevisionOrigin } from '@prisma/client';

import type { StoreCustomizationConfig } from '@/schemas/customization';
import { getDb } from '@/server/database/client';

function toJson(config: StoreCustomizationConfig): Prisma.InputJsonValue {
  return config as unknown as Prisma.InputJsonValue;
}

export async function findCustomization(tenantId: string, storeId: string) {
  return getDb().storeCustomization.findFirst({
    where: { tenantId, storeId },
  });
}

export async function ensureCustomization(
  tenantId: string,
  storeId: string,
  defaultConfig: StoreCustomizationConfig,
) {
  return getDb().storeCustomization.upsert({
    where: { storeId },
    update: {},
    create: {
      tenantId,
      storeId,
      schemaVersion: defaultConfig.schemaVersion,
      publishedConfig: toJson(defaultConfig),
      publishedVersion: 0,
    },
  });
}

export async function listRevisions(tenantId: string, storeId: string, take = 20) {
  return getDb().storeCustomizationRevision.findMany({
    where: { tenantId, storeId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take,
    select: {
      id: true,
      version: true,
      schemaVersion: true,
      action: true,
      reason: true,
      origin: true,
      actorUserId: true,
      createdAt: true,
      publishedAt: true,
      actor: { select: { id: true, name: true, email: true } },
    },
  });
}

export async function findRevision(tenantId: string, storeId: string, revisionId: string) {
  return getDb().storeCustomizationRevision.findFirst({
    where: { id: revisionId, tenantId, storeId },
  });
}

export function jsonInput(config: StoreCustomizationConfig): Prisma.InputJsonValue {
  return toJson(config);
}

export function normalizeDraftOrigin(
  value: CustomizationRevisionOrigin | null,
): CustomizationRevisionOrigin {
  return value ?? 'SUPER_ADMIN_UI';
}

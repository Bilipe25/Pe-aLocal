import 'server-only';

import type { Prisma } from '@prisma/client';

import { isDeployedRuntime } from '@/server/runtime-environment';
import {
  createRecognitionSecret,
  hashRecognitionSecret,
  isRecognitionSecret,
} from '@/server/services/customer-recognition.service';

const DEVICE_RECOGNITION_TTL_MS = 90 * 24 * 60 * 60 * 1_000;
const MAX_ACTIVE_DEVICES_PER_CUSTOMER_STORE = 5;

export function getStorefrontDeviceCookieName() {
  return isDeployedRuntime() ? '__Host-pedidolocal_device' : 'pedidolocal_device';
}

export function createStorefrontDeviceToken() {
  return createRecognitionSecret();
}

export function isStorefrontDeviceToken(value: string | null | undefined): value is string {
  return isRecognitionSecret(value);
}

export async function hashStorefrontDeviceToken(value: string) {
  return hashRecognitionSecret(value);
}

export function getStorefrontDeviceExpiration(now = new Date()) {
  return new Date(now.getTime() + DEVICE_RECOGNITION_TTL_MS);
}

export function storefrontDeviceCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    secure: isDeployedRuntime(),
    sameSite: 'lax' as const,
    path: '/',
    expires: expiresAt,
    maxAge: Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / 1_000)),
  };
}

interface PersistDeviceRecognitionParams {
  tx: Prisma.TransactionClient;
  tokenHash: string;
  tenantId: string;
  storeId: string;
  customerId: string;
  now: Date;
}

export interface PersistDeviceRecognitionResult {
  remembered: true;
  expiresAt: Date;
}

/**
 * Reconhecimento não autenticado. Este vínculo só pode ser criado depois de
 * um pedido válido e com consentimento. Ele jamais autoriza leitura de PII.
 */
export async function persistDeviceRecognitionAfterOrder({
  tx,
  tokenHash,
  tenantId,
  storeId,
  customerId,
  now,
}: PersistDeviceRecognitionParams): Promise<PersistDeviceRecognitionResult | null> {
  if (!/^[0-9a-f]{64}$/.test(tokenHash)) return null;

  const customer = await tx.customer.findFirst({
    where: { id: customerId, tenantId, recognitionEnabled: true },
    select: { id: true },
  });
  if (!customer) return null;

  const expiresAt = getStorefrontDeviceExpiration(now);
  const device = await tx.storefrontDevice.upsert({
    where: { tokenHash },
    create: { tokenHash, lastUsedAt: now, expiresAt },
    update: { lastUsedAt: now, expiresAt },
    select: { id: true },
  });

  const recognition = await tx.customerDeviceRecognition.upsert({
    where: {
      storefrontDeviceId_storeId: {
        storefrontDeviceId: device.id,
        storeId,
      },
    },
    create: {
      storefrontDeviceId: device.id,
      tenantId,
      storeId,
      customerId,
      lastUsedAt: now,
      expiresAt,
    },
    update: {
      tenantId,
      customerId,
      lastUsedAt: now,
      expiresAt,
      revokedAt: null,
    },
    select: { id: true },
  });

  const activeRecognitions = await tx.customerDeviceRecognition.findMany({
    where: {
      tenantId,
      storeId,
      customerId,
      revokedAt: null,
      expiresAt: { gt: now },
    },
    orderBy: [{ lastUsedAt: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
    select: { id: true },
  });
  const excessIds = activeRecognitions
    .filter((candidate) => candidate.id !== recognition.id)
    .slice(MAX_ACTIVE_DEVICES_PER_CUSTOMER_STORE - 1)
    .map((candidate) => candidate.id);
  if (excessIds.length > 0) {
    await tx.customerDeviceRecognition.updateMany({
      where: { id: { in: excessIds }, tenantId, storeId, customerId, revokedAt: null },
      data: { revokedAt: now },
    });
  }

  return { remembered: true, expiresAt };
}

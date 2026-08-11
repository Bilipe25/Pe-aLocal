import 'server-only';

import { cookies } from 'next/headers';
import { Prisma, type PrismaClient } from '@prisma/client';

import { sha256Hex } from '@/lib/web-push/base64url';
import type { WebPushSubscriptionInput } from '@/schemas/web-push';
import { getDb } from '@/server/database/client';
import { AuthorizationError } from '@/server/errors';
import { hasTenantPermission, Permission, type TenantRole } from '@/server/permissions';
import { createAuditLog } from '@/server/repositories/audit-log.repository';
import { isAllowedWebPushOrigin } from '@/server/services/web-push-subscription.service';
import {
  countAuthorizedPendingStoreOrders,
  hasStoreStaffPushPermission,
  isStoreStaffPushAssociationAuthorized,
} from '@/server/services/store-staff-push-access';

export const MERCHANT_PUSH_DEVICE_COOKIE = 'pedidolocal-merchant-push-device';

export interface StoreStaffPushContext {
  userId: string;
  tenantId: string;
  tenantRole: TenantRole;
  storeId: string;
}

function assertPermissions(role: TenantRole) {
  if (!hasStoreStaffPushPermission(role)) {
    throw new AuthorizationError('Seu perfil não possui permissão para alertas de pedidos.');
  }
}

export async function getStoreStaffPendingOrderCount(
  db: PrismaClient,
  userId: string,
  webPushSubscriptionId: string,
) {
  return countAuthorizedPendingStoreOrders(db, userId, webPushSubscriptionId);
}

export async function getStoreStaffPushSubscriptionState(
  context: StoreStaffPushContext,
  endpointHash: string,
) {
  assertPermissions(context.tenantRole);
  const db = getDb();
  const subscription = await db.webPushSubscription.findUnique({
    where: { endpointHash },
    select: { id: true, revokedAt: true, expirationTime: true },
  });
  if (!subscription || subscription.revokedAt) return { enabled: false, badgeCount: 0 };
  const association = await db.storeStaffPushSubscription.findFirst({
    where: {
      tenantId: context.tenantId,
      storeId: context.storeId,
      userId: context.userId,
      webPushSubscriptionId: subscription.id,
      disabledAt: null,
    },
    include: {
      membership: { include: { tenant: true, user: true } },
      store: true,
      subscription: true,
    },
  });
  const badgeCount = await getStoreStaffPendingOrderCount(db, context.userId, subscription.id);
  return {
    enabled: Boolean(association && isStoreStaffPushAssociationAuthorized(association)),
    badgeCount,
  };
}

export async function getStoreStaffPushAssociationForTest(
  context: StoreStaffPushContext,
  endpointHash: string,
) {
  assertPermissions(context.tenantRole);
  const db = getDb();
  const association = await db.storeStaffPushSubscription.findFirst({
    where: {
      tenantId: context.tenantId,
      storeId: context.storeId,
      userId: context.userId,
      disabledAt: null,
      subscription: { endpointHash, revokedAt: null },
    },
    include: {
      membership: { include: { tenant: true, user: true } },
      store: true,
      subscription: true,
    },
  });
  return association && isStoreStaffPushAssociationAuthorized(association)
    ? { id: association.id }
    : null;
}

export async function enableStoreStaffPushSubscription(input: {
  context: StoreStaffPushContext;
  origin: string;
  subscription: WebPushSubscriptionInput;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  assertPermissions(input.context.tenantRole);
  if (
    !(await isAllowedWebPushOrigin(input.origin, input.context.tenantId, input.context.storeId))
  ) {
    return null;
  }
  const db = getDb();
  const endpointHash = await sha256Hex(input.subscription.endpoint);
  const expirationTime = input.subscription.expirationTime
    ? new Date(input.subscription.expirationTime)
    : null;
  const now = new Date();
  const result = await db.$transaction(async (tx) => {
    const subscription = await tx.webPushSubscription.upsert({
      where: { endpointHash },
      create: {
        endpoint: input.subscription.endpoint,
        endpointHash,
        p256dh: input.subscription.keys.p256dh,
        auth: input.subscription.keys.auth,
        origin: input.origin,
        expirationTime,
      },
      update: {
        endpoint: input.subscription.endpoint,
        p256dh: input.subscription.keys.p256dh,
        auth: input.subscription.keys.auth,
        origin: input.origin,
        expirationTime,
        lastSeenAt: now,
        revokedAt: null,
        revokedReason: null,
      },
      select: { id: true },
    });
    await tx.$queryRaw(Prisma.sql`
      SELECT id FROM web_push_subscriptions WHERE id = ${subscription.id} FOR UPDATE
    `);
    await tx.storeStaffPushSubscription.updateMany({
      where: {
        webPushSubscriptionId: subscription.id,
        userId: { not: input.context.userId },
        disabledAt: null,
      },
      data: {
        disabledAt: now,
        disabledReason: 'device_user_changed',
        lockedAt: null,
        lockToken: null,
      },
    });
    const association = await tx.storeStaffPushSubscription.upsert({
      where: {
        storeId_userId_webPushSubscriptionId: {
          storeId: input.context.storeId,
          userId: input.context.userId,
          webPushSubscriptionId: subscription.id,
        },
      },
      create: {
        tenantId: input.context.tenantId,
        storeId: input.context.storeId,
        userId: input.context.userId,
        webPushSubscriptionId: subscription.id,
      },
      update: {
        enabledAt: now,
        disabledAt: null,
        disabledReason: null,
        lastConfirmedAt: now,
        lockedAt: null,
        lockToken: null,
      },
      select: { id: true },
    });
    await createAuditLog(
      {
        tenantId: input.context.tenantId,
        storeId: input.context.storeId,
        userId: input.context.userId,
        action: 'UPDATE',
        entity: 'StoreStaffPushSubscription',
        entityId: association.id,
        metadata: { operation: 'enabled' },
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      },
      tx,
    );
    return { subscriptionId: subscription.id };
  });
  console.info('[MERCHANT_WEB_PUSH_SUBSCRIPTION_ENABLED]', {
    tenantId: input.context.tenantId,
    storeId: input.context.storeId,
    userId: input.context.userId,
  });
  return { enabled: true, endpointHash, ...result };
}

export async function disableStoreStaffPushSubscription(input: {
  context: StoreStaffPushContext;
  endpointHash: string;
  reason?: string;
}) {
  assertPermissions(input.context.tenantRole);
  const db = getDb();
  const subscription = await db.webPushSubscription.findUnique({
    where: { endpointHash: input.endpointHash },
    select: { id: true },
  });
  if (!subscription) return { enabled: false, remaining: 0 };
  const now = new Date();
  const result = await db.$transaction(async (tx) => {
    const associations = await tx.storeStaffPushSubscription.findMany({
      where: {
        tenantId: input.context.tenantId,
        storeId: input.context.storeId,
        userId: input.context.userId,
        webPushSubscriptionId: subscription.id,
        disabledAt: null,
      },
      select: { id: true },
    });
    await tx.storeStaffPushSubscription.updateMany({
      where: { id: { in: associations.map(({ id }) => id) } },
      data: {
        disabledAt: now,
        disabledReason: input.reason ?? 'user_disabled',
        lockedAt: null,
        lockToken: null,
      },
    });
    for (const association of associations) {
      await createAuditLog(
        {
          tenantId: input.context.tenantId,
          storeId: input.context.storeId,
          userId: input.context.userId,
          action: 'UPDATE',
          entity: 'StoreStaffPushSubscription',
          entityId: association.id,
          metadata: { operation: 'disabled', reason: input.reason ?? 'user_disabled' },
        },
        tx,
      );
    }
    return tx.storeStaffPushSubscription.count({
      where: {
        userId: input.context.userId,
        webPushSubscriptionId: subscription.id,
        disabledAt: null,
      },
    });
  });
  console.info('[MERCHANT_WEB_PUSH_SUBSCRIPTION_DISABLED]', {
    tenantId: input.context.tenantId,
    storeId: input.context.storeId,
    userId: input.context.userId,
  });
  return { enabled: false, remaining: result };
}

export async function disableStoreStaffPushSubscriptionsForLogout(
  userId: string,
  webPushSubscriptionId: string,
) {
  const db = getDb();
  const now = new Date();
  const associations = await db.storeStaffPushSubscription.findMany({
    where: { userId, webPushSubscriptionId, disabledAt: null },
    select: { id: true, tenantId: true, storeId: true },
  });
  if (!associations.length) return;
  await db.$transaction(async (tx) => {
    await tx.storeStaffPushSubscription.updateMany({
      where: { id: { in: associations.map(({ id }) => id) } },
      data: { disabledAt: now, disabledReason: 'user_logout', lockedAt: null, lockToken: null },
    });
    for (const association of associations) {
      await createAuditLog(
        {
          tenantId: association.tenantId,
          storeId: association.storeId,
          userId,
          action: 'UPDATE',
          entity: 'StoreStaffPushSubscription',
          entityId: association.id,
          metadata: { operation: 'disabled', reason: 'user_logout' },
        },
        tx,
      );
    }
  });
}

export async function setMerchantPushDeviceCookie(subscriptionId: string) {
  (await cookies()).set(MERCHANT_PUSH_DEVICE_COOKIE, subscriptionId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 90,
  });
}

export async function clearMerchantPushDeviceCookie() {
  (await cookies()).set(MERCHANT_PUSH_DEVICE_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: new Date(0),
  });
}

export async function getMerchantPushDeviceCookie() {
  return (await cookies()).get(MERCHANT_PUSH_DEVICE_COOKIE)?.value ?? null;
}

export function canUseStoreStaffPush(role: TenantRole) {
  return (
    hasTenantPermission(role, Permission.VIEW_ORDERS) &&
    hasTenantPermission(role, Permission.VIEW_ORDER_DETAILS)
  );
}

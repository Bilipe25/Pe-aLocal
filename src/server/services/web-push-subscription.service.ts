import 'server-only';

import type { PrismaClient } from '@prisma/client';

import { sha256Hex } from '@/lib/web-push/base64url';
import type { WebPushSubscriptionInput } from '@/schemas/web-push';
import { getDb } from '@/server/database/client';
import { findActiveStoreDomainByHostname } from '@/server/repositories/store-domain.repository';

const TERMINAL_STATUSES = new Set(['DELIVERED', 'CANCELLED']);

async function resolveOrder(db: PrismaClient, publicToken: string, storeSlug: string) {
  return db.order.findFirst({
    where: {
      publicToken,
      publicTokenExpiresAt: { gt: new Date() },
      store: { slug: storeSlug, isActive: true, tenant: { status: 'ACTIVE' } },
    },
    select: {
      id: true,
      tenantId: true,
      storeId: true,
      status: true,
      store: { select: { slug: true } },
    },
  });
}

export async function isAllowedWebPushOrigin(
  origin: string,
  tenantId: string,
  storeId: string,
): Promise<boolean> {
  const candidate = new URL(origin);
  if (candidate.protocol !== 'https:' && candidate.hostname !== 'localhost') return false;
  const appUrl = process.env.APP_URL;
  if (appUrl && new URL(appUrl).hostname.toLowerCase() === candidate.hostname.toLowerCase()) {
    return true;
  }
  if (!appUrl && candidate.hostname === 'localhost') return true;
  return Boolean(
    await findActiveStoreDomainByHostname(tenantId, storeId, candidate.hostname.toLowerCase()),
  );
}

export async function getOrderPushSubscriptionState(input: {
  publicToken: string;
  storeSlug: string;
  endpointHash: string;
}) {
  const db = getDb();
  const order = await resolveOrder(db, input.publicToken, input.storeSlug);
  if (!order) return null;
  const association = await db.orderPushSubscription.findFirst({
    where: {
      orderId: order.id,
      disabledAt: null,
      subscription: { endpointHash: input.endpointHash, revokedAt: null },
    },
    select: { id: true },
  });
  return { enabled: Boolean(association), terminal: TERMINAL_STATUSES.has(order.status) };
}

export async function enableOrderPushSubscription(input: {
  publicToken: string;
  storeSlug: string;
  origin: string;
  subscription: WebPushSubscriptionInput;
}) {
  const db = getDb();
  const order = await resolveOrder(db, input.publicToken, input.storeSlug);
  if (!order || TERMINAL_STATUSES.has(order.status)) return null;
  if (!(await isAllowedWebPushOrigin(input.origin, order.tenantId, order.storeId))) return null;

  const endpointHash = await sha256Hex(input.subscription.endpoint);
  const expirationTime = input.subscription.expirationTime
    ? new Date(input.subscription.expirationTime)
    : null;
  await db.$transaction(async (tx) => {
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
        lastSeenAt: new Date(),
        revokedAt: null,
        revokedReason: null,
      },
      select: { id: true },
    });
    await tx.orderPushSubscription.upsert({
      where: {
        orderId_webPushSubscriptionId: {
          orderId: order.id,
          webPushSubscriptionId: subscription.id,
        },
      },
      create: {
        tenantId: order.tenantId,
        storeId: order.storeId,
        orderId: order.id,
        webPushSubscriptionId: subscription.id,
      },
      update: { enabledAt: new Date(), disabledAt: null, terminalNotifiedAt: null },
    });
  });
  return { enabled: true, endpointHash };
}

export async function disableOrderPushSubscription(input: {
  publicToken: string;
  storeSlug: string;
  endpointHash: string;
}) {
  const db = getDb();
  const order = await resolveOrder(db, input.publicToken, input.storeSlug);
  if (!order) return null;
  await db.orderPushSubscription.updateMany({
    where: { orderId: order.id, subscription: { endpointHash: input.endpointHash } },
    data: { disabledAt: new Date(), lockedAt: null, lockToken: null },
  });
  return { enabled: false };
}

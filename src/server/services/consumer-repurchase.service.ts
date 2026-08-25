import 'server-only';

import { getDb } from '@/server/database/client';
import { requireConsumerForStore } from '@/server/services/consumer-auth.service';
import { rebuildOrderIntentFromHistory } from '@/server/services/repeat-order.service';

const HISTORY_WINDOW_MONTHS = 12;
const MAX_HISTORY_ORDERS = 50;

interface CompositionGroup {
  signature: string;
  count: number;
  latestOrder: {
    id: string;
    orderNumber: number;
    createdAt: Date;
    items: Array<{
      productId: string;
      productName: string;
      quantity: number;
      offerGroupId: string | null;
      options: Array<{ optionId: string }>;
    }>;
  };
}

export function buildOrderCompositionSignature(order: CompositionGroup['latestOrder']) {
  if (order.items.length === 0 || order.items.some((item) => item.offerGroupId)) return null;
  const combined = new Map<string, number>();
  for (const item of order.items) {
    const optionIds = [...new Set(item.options.map((option) => option.optionId))].sort();
    const key = JSON.stringify([item.productId, optionIds]);
    combined.set(key, (combined.get(key) ?? 0) + item.quantity);
  }
  return JSON.stringify(
    [...combined.entries()]
      .map(([key, quantity]) => [key, quantity] as const)
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

export async function getCustomerRepurchaseShortcuts(input: {
  tenantId: string;
  storeId: string;
  customerId: string;
}) {
  const since = new Date();
  since.setUTCMonth(since.getUTCMonth() - HISTORY_WINDOW_MONTHS);
  const orders = await getDb().order.findMany({
    where: {
      tenantId: input.tenantId,
      storeId: input.storeId,
      customerId: input.customerId,
      status: 'DELIVERED',
      paymentStatus: 'PAID',
      createdAt: { gte: since },
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: MAX_HISTORY_ORDERS,
    select: {
      id: true,
      orderNumber: true,
      createdAt: true,
      items: {
        orderBy: [{ position: 'asc' }, { id: 'asc' }],
        select: {
          productId: true,
          productName: true,
          quantity: true,
          offerGroupId: true,
          options: { select: { optionId: true } },
        },
      },
    },
  });
  const groups = new Map<string, CompositionGroup>();
  for (const order of orders) {
    const signature = buildOrderCompositionSignature(order);
    if (!signature) continue;
    const current = groups.get(signature);
    if (current) current.count += 1;
    else groups.set(signature, { signature, count: 1, latestOrder: order });
  }
  const ranked = [...groups.values()].sort(
    (left, right) =>
      right.count - left.count ||
      right.latestOrder.createdAt.getTime() - left.latestOrder.createdAt.getTime() ||
      left.signature.localeCompare(right.signature),
  );
  const safeGroups: CompositionGroup[] = [];
  for (const group of ranked) {
    if (group.count < 2 || safeGroups.length >= 3) break;
    const rebuild = await rebuildOrderIntentFromHistory({
      tenantId: input.tenantId,
      storeId: input.storeId,
      orderId: group.latestOrder.id,
    });
    if (rebuild && rebuild.readyItems.length > 0 && rebuild.issues.length === 0) {
      safeGroups.push(group);
    }
  }
  const toDto = (group: CompositionGroup) => ({
    orderId: group.latestOrder.id,
    orderNumber: group.latestOrder.orderNumber,
    occurrences: group.count,
    items: group.latestOrder.items.slice(0, 3).map((item) => ({
      productName: item.productName,
      quantity: item.quantity,
    })),
    extraItemsCount: Math.max(0, group.latestOrder.items.length - 3),
  });
  const usualGroup = safeGroups.find((group) => group.count >= 3) ?? null;
  return {
    usual: usualGroup ? toDto(usualGroup) : null,
    frequent: safeGroups
      .filter((group) => group.signature !== usualGroup?.signature)
      .slice(0, 2)
      .map(toDto),
  };
}

export async function getConsumerRepurchaseShortcuts(input: {
  storeSlug: string;
  sessionToken?: string | null;
}) {
  const { scope, consumer } = await requireConsumerForStore(input);
  if (!scope.entitlement?.consumerConvenienceV2Enabled || !consumer.customer) {
    return { usual: null, frequent: [] };
  }
  return getCustomerRepurchaseShortcuts({
    tenantId: scope.tenantId,
    storeId: scope.id,
    customerId: consumer.customer.id,
  });
}

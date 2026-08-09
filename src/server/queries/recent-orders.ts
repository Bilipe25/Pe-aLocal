import 'server-only';

import { cookies } from 'next/headers';
import { storeAssetUrl } from '@/features/assets/urls';
import {
  RECENT_PURCHASE_ELIGIBLE_ORDER_STATUSES,
  RECENT_PURCHASE_EXCLUDED_PAYMENT_STATUSES,
  RECENT_PURCHASE_ORDER_LIMIT,
  RECENT_PURCHASE_WINDOW_DAYS,
} from '@/features/storefront/recent-purchases';
import { getDb } from '@/server/database/client';
import {
  getStorefrontDeviceCookieName,
  hashStorefrontDeviceToken,
  isStorefrontDeviceToken,
} from '@/server/services/customer-device-recognition.service';
import type { PublicRecentOrderDto, PublicRecentOrderItemDto } from '@/types/storefront';

interface RecentOrdersScope {
  tenantId: string;
  storeId: string;
  enabled?: boolean;
}

function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Comprado hoje';
  if (diffDays === 1) return 'Comprado ontem';
  if (diffDays < 30) return `Comprado há ${diffDays} dias`;

  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `Última compra em ${day}/${month}`;
}

export async function getRecentOrdersForCurrentDevice({
  tenantId,
  storeId,
  enabled = true,
}: RecentOrdersScope): Promise<PublicRecentOrderDto[]> {
  if (!enabled) return [];

  const cookieStore = await cookies();
  const deviceToken = cookieStore.get(getStorefrontDeviceCookieName())?.value;
  if (!isStorefrontDeviceToken(deviceToken)) return [];

  const now = new Date();
  const tokenHash = await hashStorefrontDeviceToken(deviceToken);
  const device = await getDb().storefrontDevice.findUnique({
    where: { tokenHash },
    select: {
      expiresAt: true,
      recognitions: {
        where: {
          tenantId,
          storeId,
          revokedAt: null,
          expiresAt: { gt: now },
          customer: {
            tenantId,
            recognitionEnabled: true,
          },
        },
        take: 1,
        select: { customerId: true },
      },
    },
  });

  const recognition = device?.recognitions[0];
  if (!device || device.expiresAt <= now || !recognition) return [];

  const windowStart = new Date(now.getTime() - RECENT_PURCHASE_WINDOW_DAYS * 24 * 60 * 60 * 1_000);
  const rawOrders = await getDb().order.findMany({
    where: {
      tenantId,
      storeId,
      customerId: recognition.customerId,
      createdAt: { gte: windowStart },
      status: { in: [...RECENT_PURCHASE_ELIGIBLE_ORDER_STATUSES] },
      OR: [
        { payment: { is: null } },
        {
          payment: {
            is: { status: { notIn: [...RECENT_PURCHASE_EXCLUDED_PAYMENT_STATUSES] } },
          },
        },
      ],
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: RECENT_PURCHASE_ORDER_LIMIT,
    select: {
      id: true,
      orderNumber: true,
      createdAt: true,
      total: true,
      items: {
        select: {
          id: true,
          productId: true,
          productName: true,
          unitPrice: true,
          quantity: true,
          notes: true,
          itemTotal: true,
          options: {
            select: {
              optionName: true,
              optionPrice: true,
            },
          },
        },
      },
    },
  });

  if (rawOrders.length === 0) return [];

  // Cada pedido é uma unidade histórica. Pedidos iguais em datas diferentes
  // continuam distintos e podem ter observações ou contexto operacional próprio.
  const recentOrders = rawOrders.filter((order) => order.items.length > 0).slice(0, 5);
  if (recentOrders.length === 0) return [];

  // Collect product IDs for thumbnail image lookup
  const productIds = [
    ...new Set(recentOrders.flatMap((order) => order.items.map((item) => item.productId))),
  ];

  const products =
    productIds.length > 0
      ? await getDb().product.findMany({
          where: { tenantId, storeId, id: { in: productIds } },
          select: { id: true, imageUrl: true, imageAssetId: true },
        })
      : [];

  const productMap = new Map<
    string,
    { id: string; imageUrl: string | null; imageAssetId: string | null }
  >(products.map((p) => [p.id, p]));

  // Build result DTOs
  return recentOrders.map((order) => {
    const totalItemCount = order.items.reduce((acc, item) => acc + item.quantity, 0);

    const itemsSummaryNames = order.items.map((item) => item.productName);
    const summaryHead = itemsSummaryNames.slice(0, 3).join(', ');
    const itemsSummary = summaryHead;
    const extraItemsCount = Math.max(0, itemsSummaryNames.length - 3);

    // Build thumbnails list (up to 4)
    const thumbnails: PublicRecentOrderDto['thumbnails'] = [];
    for (const item of order.items) {
      const p = productMap.get(item.productId);
      const imageUrl = p?.imageAssetId ? storeAssetUrl(p.imageAssetId, 384) : (p?.imageUrl ?? null);
      thumbnails.push({
        imageUrl,
        imageAssetId: p?.imageAssetId ?? null,
        productName: item.productName,
      });
      if (thumbnails.length >= 4) break;
    }

    const extraThumbnailsCount = Math.max(0, order.items.length - thumbnails.length);

    const formattedItems: PublicRecentOrderItemDto[] = order.items.map((item) => {
      const p = productMap.get(item.productId);
      const imageUrl = p?.imageAssetId ? storeAssetUrl(p.imageAssetId, 384) : (p?.imageUrl ?? null);
      return {
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        notes: item.notes ?? '',
        imageUrl,
        imageAssetId: p?.imageAssetId ?? null,
        options: item.options.map((opt) => ({
          name: opt.optionName,
          price: opt.optionPrice,
        })),
      };
    });

    return {
      id: order.id,
      orderNumber: order.orderNumber,
      lastPurchasedAt: order.createdAt.toISOString(),
      timeAgoLabel: formatTimeAgo(order.createdAt),
      totalItemCount,
      totalCents: order.total,
      itemsSummary,
      extraItemsCount,
      thumbnails,
      extraThumbnailsCount,
      items: formattedItems,
    };
  });
}

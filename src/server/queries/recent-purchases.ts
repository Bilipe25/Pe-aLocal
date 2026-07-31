import 'server-only';

import { cookies } from 'next/headers';

import { storeAssetUrl } from '@/features/assets/urls';
import {
  RECENT_PURCHASE_ELIGIBLE_ORDER_STATUSES,
  RECENT_PURCHASE_EXCLUDED_PAYMENT_STATUSES,
  RECENT_PURCHASE_ORDER_LIMIT,
  RECENT_PURCHASE_WINDOW_DAYS,
  rankRecentPurchaseProducts,
  type RecentPurchaseProductCandidate,
} from '@/features/storefront/recent-purchases';
import { getDb } from '@/server/database/client';
import {
  getStorefrontDeviceCookieName,
  hashStorefrontDeviceToken,
  isStorefrontDeviceToken,
} from '@/server/services/customer-device-recognition.service';
import type { PublicRecentPurchaseProductDto } from '@/types/storefront';

interface RecentPurchasedProductsScope {
  tenantId: string;
  storeId: string;
  enabled?: boolean;
}

/**
 * Consulta privada por request. Não adicionar unstable_cache: o reconhecimento
 * é específico do aparelho e nunca pode compartilhar resultados entre clientes.
 */
export async function getRecentPurchasedProductsForCurrentDevice({
  tenantId,
  storeId,
  enabled = true,
}: RecentPurchasedProductsScope): Promise<PublicRecentPurchaseProductDto[]> {
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
  const orders = await getDb().order.findMany({
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
      createdAt: true,
      deliveredAt: true,
      items: { select: { productId: true } },
    },
  });
  if (orders.length === 0) return [];

  const productIds = [
    ...new Set(orders.flatMap((order) => order.items.map((item) => item.productId))),
  ];
  const products = await getDb().product.findMany({
    where: {
      id: { in: productIds },
      tenantId,
      storeId,
      archivedAt: null,
      isAvailable: true,
      isSoldOut: false,
      basePrice: { gt: 0 },
      category: {
        tenantId,
        storeId,
        archivedAt: null,
        isActive: true,
      },
    },
    select: {
      id: true,
      name: true,
      description: true,
      imageUrl: true,
      imageAssetId: true,
      basePrice: true,
      isAvailable: true,
      isFeatured: true,
      isSoldOut: true,
      sortOrder: true,
      category: {
        select: {
          id: true,
          name: true,
          sortOrder: true,
        },
      },
      optionGroups: {
        where: { isActive: true, archivedAt: null },
        select: {
          _count: {
            select: {
              options: { where: { isAvailable: true, archivedAt: null } },
            },
          },
        },
      },
    },
  });

  const candidates: RecentPurchaseProductCandidate[] = products.map((product) => ({
    id: product.id,
    name: product.name,
    description: product.description,
    imageUrl: product.imageAssetId ? storeAssetUrl(product.imageAssetId, 384) : product.imageUrl,
    imageAssetId: product.imageAssetId,
    basePrice: product.basePrice,
    isAvailable: product.isAvailable,
    isFeatured: product.isFeatured,
    isSoldOut: product.isSoldOut,
    category: { id: product.category.id, name: product.category.name },
    requiresConfiguration: product.optionGroups.some((group) => group._count.options > 0),
    categorySortOrder: product.category.sortOrder,
    productSortOrder: product.sortOrder,
  }));

  return rankRecentPurchaseProducts(
    orders.map((order) => ({
      purchasedAt: order.deliveredAt ?? order.createdAt,
      productIds: order.items.map((item) => item.productId),
    })),
    candidates,
  );
}

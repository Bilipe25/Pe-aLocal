import 'server-only';

import { getDb } from '@/server/database/client';
import { NotFoundError } from '@/server/errors';
import { requireConsumerForStore } from '@/server/services/consumer-auth.service';

const MAX_FAVORITES = 1_000;

async function requireFavoriteScope(input: { storeSlug: string; sessionToken?: string | null }) {
  const authorized = await requireConsumerForStore(input);
  if (!authorized.scope.entitlement?.consumerConvenienceV2Enabled) {
    throw new NotFoundError('Página');
  }
  return authorized;
}

export async function listConsumerFavorites(input: {
  storeSlug: string;
  sessionToken?: string | null;
}) {
  const { scope, consumer } = await requireFavoriteScope(input);
  const favorites = await getDb().consumerFavorite.findMany({
    where: {
      consumerIdentityId: consumer.identityId,
      tenantId: scope.tenantId,
      storeId: scope.id,
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: MAX_FAVORITES,
    select: { productId: true },
  });
  return { productIds: favorites.map((favorite) => favorite.productId) };
}

async function resolveStoreProductIds(input: {
  tenantId: string;
  storeId: string;
  productIds: string[];
}) {
  if (input.productIds.length === 0) return [];
  const products = await getDb().product.findMany({
    where: {
      id: { in: [...new Set(input.productIds)].slice(0, MAX_FAVORITES) },
      tenantId: input.tenantId,
      storeId: input.storeId,
    },
    select: { id: true },
  });
  return products.map((product) => product.id);
}

export async function mergeConsumerFavorites(input: {
  storeSlug: string;
  sessionToken?: string | null;
  productIds: string[];
}) {
  const { scope, consumer } = await requireFavoriteScope(input);
  const productIds = await resolveStoreProductIds({
    tenantId: scope.tenantId,
    storeId: scope.id,
    productIds: input.productIds,
  });
  if (productIds.length > 0) {
    await getDb().consumerFavorite.createMany({
      data: productIds.map((productId) => ({
        consumerIdentityId: consumer.identityId,
        tenantId: scope.tenantId,
        storeId: scope.id,
        productId,
      })),
      skipDuplicates: true,
    });
  }
  return listConsumerFavorites(input);
}

export async function removeConsumerFavorite(input: {
  storeSlug: string;
  sessionToken?: string | null;
  productId: string;
}) {
  const { scope, consumer } = await requireFavoriteScope(input);
  await getDb().consumerFavorite.deleteMany({
    where: {
      consumerIdentityId: consumer.identityId,
      tenantId: scope.tenantId,
      storeId: scope.id,
      productId: input.productId,
    },
  });
  return { success: true };
}

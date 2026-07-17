// =============================================================================
// Cache Tags — PedidoLocal
// =============================================================================
// Tags centralizadas para revalidação de cache do Next.js.
// Quando um admin altera dados públicos, invalida apenas os caches necessários.
// =============================================================================

/**
 * Tag de cache para dados gerais da loja (nome, status, cores, etc.).
 */
export function storeCacheTag(storeId: string): string {
  return `store:${storeId}`;
}

/**
 * Tag pública resolvida antes de conhecermos o ID interno da loja.
 */
export function storeSlugCacheTag(slug: string): string {
  return `store-slug:${slug}`;
}

/**
 * Tag de cache para catálogo (categorias + produtos + adicionais).
 */
export function catalogCacheTag(storeId: string): string {
  return `catalog:${storeId}`;
}

/**
 * Tag de cache para zonas de entrega e taxas.
 */
export function deliveryCacheTag(storeId: string): string {
  return `delivery:${storeId}`;
}

/**
 * Tag de cache para horários de funcionamento.
 */
export function openingHoursCacheTag(storeId: string): string {
  return `hours:${storeId}`;
}

/**
 * Tag de cache para formas de pagamento aceitas.
 */
export function paymentMethodsCacheTag(storeId: string): string {
  return `payment-methods:${storeId}`;
}

export function customizationCacheTag(storeId: string): string {
  return `customization:${storeId}`;
}

export function assetsCacheTag(storeId: string): string {
  return `assets:${storeId}`;
}

export function assetCacheTag(assetId: string): string {
  return `asset:${assetId}`;
}

export function bannersCacheTag(storeId: string): string {
  return `banners:${storeId}`;
}

export function domainsCacheTag(storeId: string): string {
  return `domains:${storeId}`;
}

/**
 * Retorna todas as tags de cache de uma loja.
 * Útil para invalidar tudo quando a loja é suspensa.
 */
export function allStoreCacheTags(storeId: string): string[] {
  return [
    storeCacheTag(storeId),
    catalogCacheTag(storeId),
    deliveryCacheTag(storeId),
    openingHoursCacheTag(storeId),
    paymentMethodsCacheTag(storeId),
    customizationCacheTag(storeId),
    assetsCacheTag(storeId),
    bannersCacheTag(storeId),
    domainsCacheTag(storeId),
  ];
}

/**
 * Objeto de conveniência para uso nas Server Actions.
 */
export const CACHE_TAGS = {
  store: storeCacheTag,
  storeSlug: storeSlugCacheTag,
  catalog: catalogCacheTag,
  delivery: deliveryCacheTag,
  hours: openingHoursCacheTag,
  paymentMethods: paymentMethodsCacheTag,
  customization: customizationCacheTag,
  assets: assetsCacheTag,
  asset: assetCacheTag,
  banners: bannersCacheTag,
  domains: domainsCacheTag,
  all: allStoreCacheTags,
} as const;

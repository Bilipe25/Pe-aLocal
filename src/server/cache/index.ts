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
  ];
}

/**
 * Objeto de conveniência para uso nas Server Actions.
 */
export const CACHE_TAGS = {
  store: storeCacheTag,
  catalog: catalogCacheTag,
  delivery: deliveryCacheTag,
  hours: openingHoursCacheTag,
  paymentMethods: paymentMethodsCacheTag,
  all: allStoreCacheTags,
} as const;

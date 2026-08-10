export function storeAssetUrl(assetId: string, width?: number): string {
  const base = `/api/store-assets/${encodeURIComponent(assetId)}`;
  return width ? `${base}?width=${width}` : base;
}

export type StorePwaIconVariant = 'apple-180' | 'any-192' | 'any-512' | 'maskable-512';

export function storePwaIconUrl(
  assetId: string,
  variant: StorePwaIconVariant,
  backgroundColor?: string,
): string {
  const params = new URLSearchParams({ variant: `pwa-${variant}` });
  if (variant === 'maskable-512' && backgroundColor) {
    params.set('background', backgroundColor.toUpperCase());
  }
  return `${storeAssetUrl(assetId)}?${params.toString()}`;
}

/** URL autenticada para prévias no painel do estabelecimento. */
export function tenantStoreAssetUrl(assetId: string, width?: number): string {
  const base = `/api/tenant/assets/${encodeURIComponent(assetId)}`;
  return width ? `${base}?width=${width}` : base;
}

export function storeAssetSrcSet(assetId: string, widths: readonly number[]): string {
  return widths.map((width) => `${storeAssetUrl(assetId, width)} ${width}w`).join(', ');
}

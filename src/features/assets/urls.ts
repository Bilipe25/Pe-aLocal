export function storeAssetUrl(assetId: string, width?: number): string {
  const base = `/api/store-assets/${encodeURIComponent(assetId)}`;
  return width ? `${base}?width=${width}` : base;
}

export function storeAssetSrcSet(assetId: string, widths: readonly number[]): string {
  return widths.map((width) => `${storeAssetUrl(assetId, width)} ${width}w`).join(', ');
}

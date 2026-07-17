export function storeAssetUrl(assetId: string, width?: number): string {
  const base = `/api/store-assets/${encodeURIComponent(assetId)}`;
  return width ? `${base}?width=${width}` : base;
}

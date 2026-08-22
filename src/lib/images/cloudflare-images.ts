/**
 * Loader custom de `next/image` para o storefront.
 *
 * O src recebido pelo `next/image` é o `assetId` da `StoreAsset` (string não
 * URL). O loader converte `{ src, width, quality }` em uma URL da rota pública
 * `/api/store-assets/[assetId]`, que usa o binding IMAGES (Cloudflare Images)
 * no edge para o resize e a transcodificação AVIF/WebP.
 *
 * Para fontes externas (URLs `http(s)://` — assets legados do Supabase/Blob),
 * devolvemos a URL inalterada, sem quaisquer query params, preservando o
 * comportamento legado e evitando repassar assets de terceiros pelo nosso
 * pipeline de imagem.
 *
 * Os `width`s recebidos pertencem sempre a `next.config.ts#images.deviceSizes`
 * (`[96, 192, 384, 768, 1280]`), que espelha `STORE_ASSET_ALLOWED_WIDTHS` na
 * rota — assim cada variante do `srcset` é servida por uma transformação
 * válida do binding IMAGES, sem cair no fallback do asset original.
 */
/**
 * Larguras suportadas pela rota `/api/store-assets/[assetId]` (espelha
 * `STORE_ASSET_ALLOWED_WIDTHS`). Devem ser idênticas a
 * `next.config.ts#images.deviceSizes` para que toda variante do `srcset`
 * gerado pelo `next/image` tenha uma transformação válida no edge.
 */
export const STOREFRONT_IMAGE_DEVICE_SIZES = [96, 192, 384, 768, 1280] as const;

/**
 * Indica que `src` é o `assetId` de uma `StoreAsset`, e portanto deve ser
 * roteado por `/api/store-assets/[assetId]` para acionar o binding IMAGES no
 * edge. Identificadores de asset (UUIDs/IDs) não contêm `/` nem `:`. URLs
 * absolutas (`https://...`) e paths relativos legados (`/imagem.jpg`) passam
 * ilesitos pelo loader.
 */
function isAssetIdIdentifier(src: string): boolean {
  return !/:/.test(src) && !src.startsWith('/');
}

export default function cloudflareImagesLoader({
  src,
  width,
  quality,
}: {
  src: string;
  width: number;
  quality?: number;
}): string {
  if (!isAssetIdIdentifier(src)) return src;

  const base = `/api/store-assets/${encodeURIComponent(src)}`;
  const params = new URLSearchParams();
  params.set('width', String(width));
  if (quality) params.set('quality', String(quality));
  return `${base}?${params.toString()}`;
}

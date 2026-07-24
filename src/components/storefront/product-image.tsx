'use client';

import { ImageOff } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { storeAssetSrcSet, storeAssetUrl } from '@/features/assets/urls';

interface ProductImageProps {
  name: string;
  imageUrl: string | null;
  imageAssetId: string | null;
  sizes: string;
  width: number;
}

export function ProductImage({ name, imageUrl, imageAssetId, sizes, width }: ProductImageProps) {
  const resolvedImageUrl = imageAssetId ? storeAssetUrl(imageAssetId, width) : imageUrl;
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const status = !resolvedImageUrl
    ? 'missing'
    : failedUrl === resolvedImageUrl
      ? 'error'
      : loadedUrl === resolvedImageUrl
        ? 'loaded'
        : 'loading';

  useEffect(() => {
    if (!resolvedImageUrl || !imageRef.current?.complete || imageRef.current.naturalWidth > 0) {
      return;
    }
    const frame = requestAnimationFrame(() => setFailedUrl(resolvedImageUrl));
    return () => cancelAnimationFrame(frame);
  }, [resolvedImageUrl]);

  return (
    <div
      className={`storefront-product-image-frame is-${status}`}
      aria-label={status === 'error' ? `Imagem indisponível para ${name}` : undefined}
    >
      {resolvedImageUrl && status !== 'error' && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={imageRef}
          className="storefront-product-image"
          src={resolvedImageUrl}
          srcSet={imageAssetId ? storeAssetSrcSet(imageAssetId, [96, 192, 384, 768]) : undefined}
          sizes={imageAssetId ? sizes : undefined}
          alt=""
          width={width}
          height={width}
          loading="lazy"
          decoding="async"
          onLoad={() => setLoadedUrl(resolvedImageUrl)}
          onError={() => setFailedUrl(resolvedImageUrl)}
        />
      )}
      {status !== 'loaded' && (
        <span className="storefront-product-image-placeholder" aria-hidden="true">
          <ImageOff />
        </span>
      )}
    </div>
  );
}

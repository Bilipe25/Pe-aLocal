'use client';

import { ImageOff } from 'lucide-react';
import Image from 'next/image';
import { type ReactNode, useState } from 'react';

type ProductImageStatus = 'missing' | 'error' | 'loading' | 'loaded';

interface ProductImageProps {
  name: string;
  imageUrl: string | null;
  imageAssetId: string | null;
  sizes: string;
  width: number;
  loading?: 'eager' | 'lazy';
  fallback?: ReactNode;
}

export function ProductImage({
  name,
  imageUrl,
  imageAssetId,
  sizes,
  width,
  loading = 'lazy',
  fallback,
}: ProductImageProps) {
  const src = imageAssetId ?? imageUrl;
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const status: ProductImageStatus = !src
    ? 'missing'
    : failedSrc === src
      ? 'error'
      : loadedSrc === src
        ? 'loaded'
        : 'loading';
  const unavailableLabel =
    status === 'error'
      ? `Imagem indisponível para ${name}`
      : status === 'missing'
        ? `${name} está sem imagem`
        : undefined;

  return (
    <div className={`storefront-product-image-frame is-${status}`} aria-label={unavailableLabel}>
      {src && status !== 'error' && (
        <Image
          className="storefront-product-image"
          src={src}
          alt=""
          fill
          sizes={sizes}
          loading={loading}
          onLoad={() => setLoadedSrc(src)}
          onError={() => setFailedSrc(src)}
          data-asset-target-width={width}
        />
      )}
      {status !== 'loaded' && (
        <span
          className={`storefront-product-image-placeholder ${status === 'loading' ? 'is-loading' : ''}`}
          aria-hidden="true"
        >
          {status === 'loading' ? (
            <span className="storefront-product-image-shimmer" />
          ) : (
            <>
              {fallback ?? <ImageOff />}
              {!fallback && (status === 'error' || status === 'missing') && (
                <span>{status === 'error' ? 'Imagem indisponível' : 'Sem imagem'}</span>
              )}
            </>
          )}
        </span>
      )}
    </div>
  );
}

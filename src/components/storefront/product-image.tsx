'use client';

import { ImageOff } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import { storeAssetSrcSet, storeAssetUrl } from '@/features/assets/urls';

interface ProductImageProps {
  name: string;
  imageUrl: string | null;
  imageAssetId: string | null;
  sizes: string;
  width: number;
  fallback?: ReactNode;
}

export function ProductImage({
  name,
  imageUrl,
  imageAssetId,
  sizes,
  width,
  fallback,
}: ProductImageProps) {
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
  const unavailableLabel =
    status === 'error'
      ? `Imagem indisponível para ${name}`
      : status === 'missing'
        ? `${name} está sem imagem`
        : undefined;

  useEffect(() => {
    const image = imageRef.current;
    if (!resolvedImageUrl || !image?.complete) return;

    // O evento load pode acontecer antes de o React hidratar uma imagem já
    // presente no cache do navegador. Sincronize o estado com o elemento para
    // não manter a imagem carregada invisível atrás do skeleton após um reload.
    const frame = requestAnimationFrame(() => {
      if (image.naturalWidth > 0) {
        setLoadedUrl(resolvedImageUrl);
        return;
      }
      setFailedUrl(resolvedImageUrl);
    });
    return () => cancelAnimationFrame(frame);
  }, [resolvedImageUrl]);

  return (
    <div className={`storefront-product-image-frame is-${status}`} aria-label={unavailableLabel}>
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
          {fallback ?? <ImageOff />}
          {!fallback && (status === 'error' || status === 'missing') && (
            <span>{status === 'error' ? 'Imagem indisponível' : 'Sem imagem'}</span>
          )}
        </span>
      )}
    </div>
  );
}

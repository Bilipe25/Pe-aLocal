'use client';

import { useEffect, useRef, useState } from 'react';

import { storeAssetSrcSet } from '@/features/assets/urls';

interface StorefrontBannerImageProps {
  imageUrl: string;
  imageAssetId: string | null;
  alt: string;
}

export function StorefrontBannerImage({ imageUrl, imageAssetId, alt }: StorefrontBannerImageProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const available = failedUrl !== imageUrl;

  useEffect(() => {
    if (!imageRef.current?.complete || imageRef.current.naturalWidth > 0) return;
    const frame = requestAnimationFrame(() => setFailedUrl(imageUrl));
    return () => cancelAnimationFrame(frame);
  }, [imageUrl]);

  if (!available) return null;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={imageRef}
      src={imageUrl}
      srcSet={imageAssetId ? storeAssetSrcSet(imageAssetId, [384, 768, 1280]) : undefined}
      sizes="(min-width: 768px) 33vw, 100vw"
      alt={alt}
      width={1280}
      height={640}
      className="storefront-banner-image"
      loading="lazy"
      decoding="async"
      onError={() => setFailedUrl(imageUrl)}
    />
  );
}

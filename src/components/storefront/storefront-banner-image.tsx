'use client';

import Image from 'next/image';
import { useState } from 'react';

interface StorefrontBannerImageProps {
  imageUrl: string;
  imageAssetId: string | null;
  alt: string;
}

export function StorefrontBannerImage({ imageUrl, imageAssetId, alt }: StorefrontBannerImageProps) {
  const src = imageAssetId ?? imageUrl;
  const [failed, setFailed] = useState(false);

  if (!src || failed) return null;

  return (
    <Image
      className="storefront-banner-image"
      src={src}
      fill
      sizes="(min-width: 768px) 33vw, 100vw"
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

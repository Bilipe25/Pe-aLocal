'use client';

import { ImageIcon } from 'lucide-react';
import { useState } from 'react';

import { tenantStoreAssetUrl } from '@/features/assets/urls';

interface CatalogProductThumbnailProps {
  name: string;
  imageUrl: string | null;
  imageAssetId: string | null;
}

export function CatalogProductThumbnail({
  name,
  imageUrl,
  imageAssetId,
}: CatalogProductThumbnailProps) {
  const resolvedUrl = imageAssetId ? tenantStoreAssetUrl(imageAssetId, 128) : imageUrl;
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const canRenderImage = Boolean(resolvedUrl && failedUrl !== resolvedUrl);

  return (
    <span
      className="border-border bg-surface-secondary relative flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border"
      title={canRenderImage ? `Miniatura de ${name}` : `${name} está sem imagem`}
    >
      <ImageIcon className="text-text-muted size-5" aria-hidden="true" />
      {canRenderImage ? (
        // A rota autenticada aceita redimensionamento no edge e evita carregar a imagem original.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={resolvedUrl ?? undefined}
          alt=""
          width={56}
          height={56}
          loading="lazy"
          decoding="async"
          className="absolute inset-0 size-full object-cover"
          onError={() => setFailedUrl(resolvedUrl)}
        />
      ) : null}
    </span>
  );
}

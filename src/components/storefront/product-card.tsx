import { Ban, Star } from 'lucide-react';

import { storeAssetSrcSet, storeAssetUrl } from '@/features/assets/urls';
import { formatCurrency } from '@/lib/utils';

interface ProductCardProps {
  id?: string;
  name: string;
  description: string | null;
  basePrice: number;
  isFeatured: boolean;
  isSoldOut: boolean;
  imageUrl: string | null;
  imageAssetId: string | null;
  onClick: () => void;
  disabled?: boolean;
  showImage: boolean;
  showBadges: boolean;
  presentation: 'LIST' | 'GRID';
}

export function ProductCard({
  id,
  name,
  description,
  basePrice,
  isFeatured,
  isSoldOut,
  imageUrl,
  imageAssetId,
  onClick,
  disabled,
  showImage,
  showBadges,
  presentation,
}: ProductCardProps) {
  const isDisabled = disabled || isSoldOut;
  const resolvedImageUrl = imageAssetId
    ? storeAssetUrl(imageAssetId, presentation === 'LIST' ? 192 : 384)
    : imageUrl;
  const imageSizes =
    presentation === 'LIST'
      ? '64px'
      : '(max-width: 479px) calc(100vw - 2rem), (max-width: 767px) calc(50vw - 1.5rem), 360px';

  return (
    <button
      id={id}
      type="button"
      onClick={onClick}
      disabled={isDisabled}
      className={`storefront-product-card storefront-product-presentation-${presentation.toLowerCase()} ${
        isDisabled ? 'is-disabled' : ''
      }`}
    >
      {showImage && (
        <div className="storefront-product-image-wrap">
          {resolvedImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className="storefront-product-image"
              src={resolvedImageUrl}
              srcSet={
                imageAssetId ? storeAssetSrcSet(imageAssetId, [96, 192, 384, 768]) : undefined
              }
              sizes={imageAssetId ? imageSizes : undefined}
              alt=""
              width={384}
              height={384}
              loading="lazy"
              decoding="async"
              onError={(event) => {
                event.currentTarget.hidden = true;
              }}
            />
          ) : (
            <div className="storefront-product-image-placeholder" aria-hidden="true" />
          )}
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="storefront-product-name">{name}</h3>
          {showBadges && isFeatured && (
            <Star className="storefront-featured-icon h-3.5 w-3.5 shrink-0" aria-label="Destaque" />
          )}
          {showBadges && isSoldOut && (
            <span className="storefront-sold-out">
              <Ban className="h-2.5 w-2.5" /> Esgotado
            </span>
          )}
        </div>
        {description && <p className="storefront-product-description">{description}</p>}
        <p className="storefront-product-price">{formatCurrency(basePrice)}</p>
      </div>
    </button>
  );
}

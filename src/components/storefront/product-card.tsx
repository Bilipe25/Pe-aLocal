import { Ban, Heart, Plus, Star } from 'lucide-react';

import { ProductImage } from '@/components/storefront/product-image';
import { formatCurrency } from '@/lib/utils';

export type ProductCardVariant = 'featured' | 'horizontal' | 'compact';

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
  variant?: ProductCardVariant;
  presentation?: 'LIST' | 'GRID';
  isFavorite?: boolean;
  onFavoriteToggle?: () => void;
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
  variant,
  presentation,
  isFavorite = false,
  onFavoriteToggle,
}: ProductCardProps) {
  const isDisabled = disabled || isSoldOut;
  const resolvedVariant =
    variant ?? (presentation === 'GRID' ? ('compact' as const) : ('horizontal' as const));
  const imageSizes =
    resolvedVariant === 'horizontal'
      ? '(max-width: 639px) 104px, 128px'
      : resolvedVariant === 'featured'
        ? '(max-width: 639px) 72vw, 19rem'
        : '(max-width: 479px) calc(50vw - 1.5rem), 240px';
  const imageWidth = resolvedVariant === 'horizontal' ? 192 : 384;

  return (
    <article
      id={id}
      className={`storefront-product-card storefront-product-variant-${resolvedVariant} ${
        isDisabled ? 'is-disabled' : ''
      }`}
    >
      <button
        type="button"
        onClick={onClick}
        disabled={isDisabled}
        className="storefront-product-main"
        aria-label={`${isSoldOut ? 'Produto esgotado' : 'Ver produto'}: ${name}`}
      >
        {showImage && (
          <ProductImage
            name={name}
            imageUrl={imageUrl}
            imageAssetId={imageAssetId}
            sizes={imageSizes}
            width={imageWidth}
          />
        )}

        <span className="storefront-product-copy">
          <span className="storefront-product-heading">
            <h3 className="storefront-product-name">{name}</h3>
          </span>
          {showBadges && isFeatured && (
            <span className="storefront-featured-badge">
              <Star aria-hidden="true" />
              Destaque
            </span>
          )}
          {showBadges && isSoldOut && (
            <span className="storefront-sold-out">
              <Ban aria-hidden="true" /> Esgotado
            </span>
          )}
          {description && <span className="storefront-product-description">{description}</span>}
          <span className="storefront-product-price">{formatCurrency(basePrice)}</span>
        </span>
      </button>

      {onFavoriteToggle && (
        <button
          type="button"
          onClick={onFavoriteToggle}
          className={`storefront-product-favorite ${isFavorite ? 'is-active' : ''}`}
          aria-label={isFavorite ? `Remover ${name} dos favoritos` : `Favoritar ${name}`}
          aria-pressed={isFavorite}
        >
          <Heart aria-hidden="true" />
        </button>
      )}

      <button
        type="button"
        onClick={onClick}
        disabled={isDisabled}
        className="storefront-product-add"
        aria-label={isSoldOut ? `${name} está esgotado` : `Ver opções de ${name}`}
      >
        {isSoldOut ? <Ban aria-hidden="true" /> : <Plus aria-hidden="true" />}
      </button>
    </article>
  );
}

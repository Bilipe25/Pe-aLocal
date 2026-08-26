'use client';

import { Heart } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useSyncExternalStore } from 'react';

import { ProductCard } from '@/components/storefront/product-card';
import { useOptionalStorefrontClientState } from '@/components/storefront/storefront-client-state-provider';
import type { StoreCustomizationConfig } from '@/schemas/customization';
import { useFavoritesStore } from '@/stores/favorites-store';
import type { PublicStorefrontCategoryDto } from '@/types/storefront';

interface StorefrontFavoritesProps {
  storeId: string;
  storeSlug: string;
  categories: PublicStorefrontCategoryDto[];
  customization: StoreCustomizationConfig;
}

function subscribeToHydration() {
  return () => {};
}

export function StorefrontFavorites({
  storeId,
  storeSlug,
  categories,
  customization,
}: StorefrontFavoritesProps) {
  const router = useRouter();
  const shellState = useOptionalStorefrontClientState();
  const shellManagesStore = shellState?.storeId === storeId && shellState.storeSlug === storeSlug;
  const locallyHydrated = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false,
  );
  const hydrated = shellManagesStore ? (shellState?.hydrated ?? false) : locallyHydrated;
  const favoritesStoreId = useFavoritesStore((state) => state.storeId);
  const favoriteProductIds = useFavoritesStore((state) => state.productIds);
  const setStore = useFavoritesStore((state) => state.setStore);
  const toggleFavorite = useFavoritesStore((state) => state.toggleFavorite);
  const products = useMemo(() => categories.flatMap((category) => category.products), [categories]);
  const availableProductIds = useMemo(() => products.map((product) => product.id), [products]);

  useEffect(() => {
    if (shellManagesStore) return;
    setStore(storeId, availableProductIds);
  }, [availableProductIds, setStore, shellManagesStore, storeId]);

  const scopedFavoriteIds = useMemo(
    () => (favoritesStoreId === storeId ? favoriteProductIds : []),
    [favoriteProductIds, favoritesStoreId, storeId],
  );
  const favoriteIdSet = useMemo(() => new Set(scopedFavoriteIds), [scopedFavoriteIds]);
  const favoriteProducts = products.filter((product) => favoriteIdSet.has(product.id));

  if (!hydrated) {
    return (
      <div className="storefront-favorites-loading" role="status" aria-live="polite">
        Carregando seus favoritos…
      </div>
    );
  }

  if (favoriteProducts.length === 0) {
    const hasUnavailableFavorites = scopedFavoriteIds.length > 0;
    return (
      <div className="storefront-favorites-empty">
        <span aria-hidden="true">
          <Heart />
        </span>
        <h2>
          {hasUnavailableFavorites ? 'Nenhum favorito disponível agora' : 'Nenhum favorito ainda'}
        </h2>
        <p>
          {hasUnavailableFavorites
            ? 'Os produtos que você salvou não estão disponíveis no cardápio neste momento.'
            : 'Use o coração no cardápio para guardar seus preferidos.'}
        </p>
        <Link href={`/${storeSlug}`}>Ver cardápio</Link>
      </div>
    );
  }

  return (
    <div className="storefront-favorites-grid" aria-label="Produtos favoritos">
      {favoriteProducts.map((product) => (
        <ProductCard
          key={product.id}
          name={product.name}
          description={product.description}
          basePrice={product.basePrice}
          isFeatured={product.isFeatured}
          isSoldOut={product.isSoldOut}
          imageUrl={product.imageUrl}
          imageAssetId={product.imageAssetId}
          onClick={() => router.push(`/${storeSlug}#product-${product.id}`)}
          disabled={product.isSoldOut}
          showImage={customization.layout.showProductImages}
          showBadges={customization.layout.showProductBadges}
          presentation="GRID"
          isFavorite
          onFavoriteToggle={() => toggleFavorite(product.id)}
        />
      ))}
    </div>
  );
}

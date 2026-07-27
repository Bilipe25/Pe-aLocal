'use client';

import { SearchX } from 'lucide-react';
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';

import { CartFab } from '@/components/storefront/cart-fab';
import { CategoryNav } from '@/components/storefront/category-nav';
import { ProductCard } from '@/components/storefront/product-card';
import { ProductModal } from '@/components/storefront/product-modal';
import { ScrollToTop } from '@/components/storefront/scroll-to-top';
import { StoreBanners } from '@/components/storefront/store-banners';
import { StorefrontFilters } from '@/components/storefront/storefront-filters';
import { StorefrontSearch } from '@/components/storefront/storefront-search';
import { storeAssetSrcSet, storeAssetUrl } from '@/features/assets/urls';
import {
  createCatalogIndex,
  filterIndexedCatalog,
  type CatalogSort,
} from '@/features/storefront/catalog-filter';
import type { StoreCustomizationConfig, StoreSection } from '@/schemas/customization';
import { useCartStore } from '@/stores/cart-store';
import type {
  PublicStorefrontBannerDto,
  PublicStorefrontCategoryDto,
  PublicStorefrontProductDetailDto,
  PublicStorefrontProductDetailResponseDto,
  PublicStorefrontProductSummaryDto,
} from '@/types/storefront';
import { useFavoritesStore } from '@/stores/favorites-store';

interface CatalogViewProps {
  categories: PublicStorefrontCategoryDto[];
  storeId: string;
  storeSlug: string;
  storeOpen: boolean;
  customization: StoreCustomizationConfig;
  banners: PublicStorefrontBannerDto[];
}

const PRODUCT_DETAIL_CACHE_TTL_MS = 60_000;

type ProductDetailState =
  | { productId: string; status: 'loading' }
  | { productId: string; status: 'success'; detail: PublicStorefrontProductDetailDto }
  | { productId: string; status: 'error'; message: string };

function isProductDetailResponse(
  value: unknown,
  productId: string,
): value is PublicStorefrontProductDetailResponseDto {
  if (!value || typeof value !== 'object' || !('product' in value)) return false;
  const product = value.product;
  if (!product || typeof product !== 'object') return false;
  return (
    'id' in product &&
    product.id === productId &&
    'optionGroups' in product &&
    Array.isArray(product.optionGroups)
  );
}

function getProductDetailErrorMessage(payload: unknown, status: number) {
  if (status === 404) return 'Este produto não está mais disponível.';
  if (
    payload &&
    typeof payload === 'object' &&
    'message' in payload &&
    typeof payload.message === 'string'
  ) {
    return payload.message;
  }
  return 'Não foi possível carregar os detalhes. Tente novamente.';
}

export function CatalogView({
  categories,
  storeId,
  storeSlug,
  storeOpen,
  customization,
  banners,
}: CatalogViewProps) {
  const setStore = useCartStore((state) => state.setStore);
  const setFavoriteStore = useFavoritesStore((state) => state.setStore);
  const favoriteProductIds = useFavoritesStore((state) => state.productIds);
  const toggleFavorite = useFavoritesStore((state) => state.toggleFavorite);
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(
    categories[0]?.id ?? null,
  );
  const [selectedProduct, setSelectedProduct] = useState<PublicStorefrontProductSummaryDto | null>(
    null,
  );
  const [productDetailState, setProductDetailState] = useState<ProductDetailState | null>(null);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<CatalogSort>('RELEVANCE');
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const deferredSearch = useDeferredValue(search);
  const lastFocusedProductRef = useRef<HTMLElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const catalogRef = useRef<HTMLElement>(null);
  const selectedProductIdRef = useRef<string | null>(null);
  const productDetailRequestRef = useRef<AbortController | null>(null);
  const productDetailCacheRef = useRef(
    new Map<
      string,
      { detail: PublicStorefrontProductDetailDto; expirationTimer: ReturnType<typeof setTimeout> }
    >(),
  );

  useEffect(() => setStore(storeId, storeSlug), [storeId, storeSlug, setStore]);
  const availableProductIds = useMemo(
    () => categories.flatMap((category) => category.products.map((product) => product.id)),
    [categories],
  );
  useEffect(
    () => setFavoriteStore(storeId, availableProductIds),
    [availableProductIds, setFavoriteStore, storeId],
  );

  const catalogIndex = useMemo(() => createCatalogIndex(categories), [categories]);
  const visibleCategories = useMemo(() => {
    return filterIndexedCatalog(catalogIndex, {
      query: deferredSearch,
      sort,
      onlyAvailable,
    });
  }, [catalogIndex, deferredSearch, onlyAvailable, sort]);

  const featuredProducts = useMemo(
    () =>
      visibleCategories
        .flatMap((category) => category.products)
        .filter((product) => product.isFeatured),
    [visibleCategories],
  );
  const visibleProductCount = useMemo(
    () => visibleCategories.reduce((count, category) => count + category.products.length, 0),
    [visibleCategories],
  );
  const favoriteProductIdSet = useMemo(() => new Set(favoriteProductIds), [favoriteProductIds]);
  const stickyCategoryNavigation = customization.layout.categoryNavigation === 'HORIZONTAL_STICKY';
  const resolvedActiveCategoryId = visibleCategories.some(
    (category) => category.id === activeCategoryId,
  )
    ? activeCategoryId
    : (visibleCategories[0]?.id ?? null);
  const activeFilterCount = Number(sort !== 'RELEVANCE') + Number(onlyAvailable);

  const categoryNavigation = visibleCategories.length > 0 && (
    <CategoryNav
      categories={visibleCategories.map((category) => ({
        id: category.id,
        name: category.name,
        imageAssetId: category.image?.id ?? null,
        imageUrl: category.image ? storeAssetUrl(category.image.id, 96) : null,
        imageAlt: category.image?.altText ?? null,
      }))}
      activeCategoryId={resolvedActiveCategoryId}
      onCategoryClick={handleCategoryClick}
      variant={customization.layout.categoryNavigation}
      showImages={customization.layout.showCategoryImages}
    />
  );

  function handleCategoryClick(id: string) {
    if (!id) return;
    setActiveCategoryId(id);
    document.getElementById(`category-${id}`)?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'start',
    });
  }

  async function loadProductDetail(
    product: PublicStorefrontProductSummaryDto,
    bypassCache = false,
  ) {
    const cached = productDetailCacheRef.current.get(product.id);
    if (!bypassCache && cached) {
      setProductDetailState({ productId: product.id, status: 'success', detail: cached.detail });
      return;
    }
    if (cached) {
      clearTimeout(cached.expirationTimer);
      productDetailCacheRef.current.delete(product.id);
    }

    productDetailRequestRef.current?.abort();
    const controller = new AbortController();
    productDetailRequestRef.current = controller;
    setProductDetailState({ productId: product.id, status: 'loading' });

    try {
      const response = await fetch(
        `/api/storefront/${encodeURIComponent(storeSlug)}/products/${encodeURIComponent(product.id)}`,
        {
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        },
      );
      const payload: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(getProductDetailErrorMessage(payload, response.status));
      }
      if (!isProductDetailResponse(payload, product.id)) {
        throw new Error('Os detalhes recebidos são inválidos. Tente novamente.');
      }

      const expirationTimer = setTimeout(() => {
        const current = productDetailCacheRef.current.get(product.id);
        if (current?.expirationTimer === expirationTimer) {
          productDetailCacheRef.current.delete(product.id);
        }
      }, PRODUCT_DETAIL_CACHE_TTL_MS);
      productDetailCacheRef.current.set(product.id, {
        detail: payload.product,
        expirationTimer,
      });
      if (selectedProductIdRef.current === product.id) {
        setProductDetailState({
          productId: product.id,
          status: 'success',
          detail: payload.product,
        });
      }
    } catch (error) {
      if (controller.signal.aborted || selectedProductIdRef.current !== product.id) return;
      setProductDetailState({
        productId: product.id,
        status: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Não foi possível carregar os detalhes. Tente novamente.',
      });
    } finally {
      if (productDetailRequestRef.current === controller) {
        productDetailRequestRef.current = null;
      }
    }
  }

  function openProduct(product: PublicStorefrontProductSummaryDto) {
    lastFocusedProductRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    selectedProductIdRef.current = product.id;
    setSelectedProduct(product);
    void loadProductDetail(product);
  }

  function closeProduct() {
    selectedProductIdRef.current = null;
    productDetailRequestRef.current?.abort();
    productDetailRequestRef.current = null;
    setSelectedProduct(null);
    requestAnimationFrame(() => lastFocusedProductRef.current?.focus());
  }

  useEffect(
    () => () => {
      selectedProductIdRef.current = null;
      productDetailRequestRef.current?.abort();
      for (const cached of productDetailCacheRef.current.values()) {
        clearTimeout(cached.expirationTimer);
      }
      productDetailCacheRef.current.clear();
    },
    [],
  );

  function clearSearch() {
    setSearch('');
    requestAnimationFrame(() => searchInputRef.current?.focus());
  }

  function clearCatalogFilters() {
    setSearch('');
    setSort('RELEVANCE');
    setOnlyAvailable(false);
    requestAnimationFrame(() => searchInputRef.current?.focus());
  }

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const id = entry.target.getAttribute('data-category-id');
            if (id) setActiveCategoryId(id);
          }
        }
      },
      { rootMargin: '-100px 0px -60% 0px', threshold: 0 },
    );

    const sections = catalogRef.current?.querySelectorAll('[data-category-id]') ?? [];
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [visibleCategories]);

  const productCard = (
    product: PublicStorefrontProductSummaryDto,
    variant: 'featured' | 'horizontal' | 'compact',
    withAnchor = false,
  ) => (
    <ProductCard
      key={product.id}
      id={withAnchor ? `product-${product.id}` : undefined}
      name={product.name}
      description={product.description}
      basePrice={product.basePrice}
      isFeatured={product.isFeatured}
      isSoldOut={product.isSoldOut}
      imageUrl={product.imageUrl}
      imageAssetId={product.imageAssetId}
      onClick={() => openProduct(product)}
      showImage={customization.layout.showProductImages}
      showBadges={customization.layout.showProductBadges}
      variant={variant}
      isFavorite={favoriteProductIdSet.has(product.id)}
      onFavoriteToggle={() => toggleFavorite(product.id)}
    />
  );

  function renderSection(section: StoreSection) {
    if (section === 'CATEGORIES' && visibleCategories.length > 0) {
      return stickyCategoryNavigation ? null : <div key={section}>{categoryNavigation}</div>;
    }

    if (section === 'BANNERS') {
      return <StoreBanners key={section} banners={banners} />;
    }

    if (
      section === 'FEATURED' &&
      customization.layout.showFeaturedProducts &&
      featuredProducts.length > 0
    ) {
      return (
        <section key={section} className="storefront-featured-section">
          <h2 className="storefront-section-title">Destaques</h2>
          <div className="storefront-featured-track" aria-label="Produtos em destaque">
            {featuredProducts.map((product) => productCard(product, 'featured'))}
          </div>
        </section>
      );
    }

    if (section === 'CATALOG') {
      return (
        <main
          key={section}
          ref={catalogRef}
          className="storefront-catalog"
          aria-busy={search !== deferredSearch}
        >
          {visibleCategories.length > 0 && (deferredSearch.trim() || activeFilterCount > 0) && (
            <p className="sr-only" role="status" aria-live="polite">
              {visibleProductCount}{' '}
              {visibleProductCount === 1 ? 'produto encontrado' : 'produtos encontrados'}
            </p>
          )}
          {visibleCategories.length === 0 ? (
            <section className="storefront-empty" role="status" aria-live="polite">
              <div className="storefront-empty-icon" aria-hidden="true">
                <SearchX aria-hidden="true" />
              </div>
              <h2 className="storefront-empty-title">
                {deferredSearch.trim()
                  ? `Nenhum resultado para “${deferredSearch.trim()}”`
                  : activeFilterCount > 0
                    ? 'Nenhum produto com esses filtros'
                    : 'Cardápio em atualização'}
              </h2>
              <p>
                {deferredSearch.trim()
                  ? 'Tente outro nome ou limpe a busca para navegar pelas categorias.'
                  : activeFilterCount > 0
                    ? 'Remova os filtros para voltar a ver todos os itens do cardápio.'
                    : 'A loja ainda não publicou produtos disponíveis. Volte em breve.'}
              </p>
              {(deferredSearch.trim() || activeFilterCount > 0) && (
                <button
                  type="button"
                  onClick={activeFilterCount > 0 ? clearCatalogFilters : clearSearch}
                  className="storefront-empty-action"
                >
                  {activeFilterCount > 0 ? 'Limpar busca e filtros' : 'Limpar busca'}
                </button>
              )}
            </section>
          ) : (
            visibleCategories.map((category) => (
              <section
                key={category.id}
                id={`category-${category.id}`}
                data-category-id={category.id}
                className="storefront-category-section storefront-section-reveal"
              >
                <div className="storefront-category-heading">
                  {customization.layout.showCategoryImages &&
                    customization.layout.categoryNavigation === 'DROPDOWN' &&
                    category.image && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={storeAssetUrl(category.image.id, 192)}
                        srcSet={storeAssetSrcSet(category.image.id, [96, 192, 384])}
                        sizes="72px"
                        alt={category.image.altText}
                        width={96}
                        height={96}
                        loading="lazy"
                        decoding="async"
                        onError={(event) => {
                          event.currentTarget.hidden = true;
                        }}
                        className="storefront-category-heading-image"
                      />
                    )}
                  <h2 className="storefront-section-title">{category.name}</h2>
                </div>
                {customization.layout.showCategoryDescription && category.description && (
                  <p className="storefront-category-description">{category.description}</p>
                )}
                <div
                  className={`storefront-product-grid ${
                    customization.layout.productPresentation === 'GRID'
                      ? 'storefront-product-grid-compact'
                      : ''
                  }`}
                >
                  {category.products.map((product) =>
                    productCard(
                      product,
                      customization.layout.productPresentation === 'GRID'
                        ? 'compact'
                        : 'horizontal',
                      true,
                    ),
                  )}
                </div>
              </section>
            ))
          )}
        </main>
      );
    }

    if (section === 'STORE_INFO' && customization.identity.aboutText) {
      return (
        <section key={section} className="storefront-store-info">
          <h2 className="storefront-section-title">Sobre a loja</h2>
          <p>{customization.identity.aboutText}</p>
        </section>
      );
    }

    return null;
  }

  const selectedProductDetail =
    selectedProduct &&
    productDetailState?.productId === selectedProduct.id &&
    productDetailState.status === 'success'
      ? productDetailState.detail
      : null;
  const selectedProductDetailStatus =
    selectedProduct && productDetailState?.productId === selectedProduct.id
      ? productDetailState.status
      : 'loading';
  const selectedProductDetailError =
    selectedProduct &&
    productDetailState?.productId === selectedProduct.id &&
    productDetailState.status === 'error'
      ? productDetailState.message
      : undefined;

  return (
    <>
      {customization.layout.showSearch && (
        <StorefrontSearch
          value={search}
          onChange={setSearch}
          inputRef={searchInputRef}
          onFilterClick={() => setFiltersOpen(true)}
          activeFilterCount={activeFilterCount}
          isBusy={search !== deferredSearch}
        />
      )}

      {stickyCategoryNavigation && categoryNavigation}

      {customization.layout.sectionOrder.map(renderSection)}

      {selectedProduct && (
        <ProductModal
          product={selectedProduct}
          detail={selectedProductDetail}
          detailStatus={selectedProductDetailStatus}
          detailError={selectedProductDetailError}
          onRetry={() => void loadProductDetail(selectedProduct, true)}
          onClose={closeProduct}
          storeOpen={storeOpen}
          isFavorite={favoriteProductIdSet.has(selectedProduct.id)}
          onFavoriteToggle={() => toggleFavorite(selectedProduct.id)}
        />
      )}

      <StorefrontFilters
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        sort={sort}
        onlyAvailable={onlyAvailable}
        onApply={(filters) => {
          setSort(filters.sort);
          setOnlyAvailable(filters.onlyAvailable);
        }}
      />

      <ScrollToTop />
      <CartFab storeId={storeId} />
    </>
  );
}

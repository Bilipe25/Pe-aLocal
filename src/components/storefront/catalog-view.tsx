'use client';

import { Search, SearchX } from 'lucide-react';
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';

import { CartFab } from '@/components/storefront/cart-fab';
import { CategoryNav } from '@/components/storefront/category-nav';
import { ProductCard } from '@/components/storefront/product-card';
import { ProductModal } from '@/components/storefront/product-modal';
import { StoreBanners } from '@/components/storefront/store-banners';
import { storeAssetSrcSet, storeAssetUrl } from '@/features/assets/urls';
import type { StoreCustomizationConfig, StoreSection } from '@/schemas/customization';
import { useCartStore } from '@/stores/cart-store';
import type {
  PublicStorefrontBannerDto,
  PublicStorefrontCategoryDto,
  PublicStorefrontProductDto,
} from '@/types/storefront';

interface CatalogViewProps {
  categories: PublicStorefrontCategoryDto[];
  storeId: string;
  storeSlug: string;
  storeOpen: boolean;
  customization: StoreCustomizationConfig;
  banners: PublicStorefrontBannerDto[];
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
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(
    categories[0]?.id ?? null,
  );
  const [selectedProduct, setSelectedProduct] = useState<PublicStorefrontProductDto | null>(null);
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const lastFocusedProductRef = useRef<HTMLElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setStore(storeId, storeSlug), [storeId, storeSlug, setStore]);

  const visibleCategories = useMemo(() => {
    const term = deferredSearch.trim().toLocaleLowerCase('pt-BR');
    if (!term) return categories;

    return categories
      .map((category) => ({
        ...category,
        products: category.products.filter((product) =>
          `${product.name} ${product.description ?? ''}`.toLocaleLowerCase('pt-BR').includes(term),
        ),
      }))
      .filter((category) => category.products.length > 0);
  }, [categories, deferredSearch]);

  const featuredProducts = useMemo(
    () =>
      visibleCategories
        .flatMap((category) => category.products)
        .filter((product) => product.isFeatured),
    [visibleCategories],
  );

  function handleCategoryClick(id: string) {
    if (!id) return;
    setActiveCategoryId(id);
    document.getElementById(`category-${id}`)?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'start',
    });
  }

  function openProduct(product: PublicStorefrontProductDto) {
    lastFocusedProductRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setSelectedProduct(product);
  }

  function closeProduct() {
    setSelectedProduct(null);
    requestAnimationFrame(() => lastFocusedProductRef.current?.focus());
  }

  function clearSearch() {
    setSearch('');
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

    const sections = document.querySelectorAll('[data-category-id]');
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [visibleCategories]);

  const productCard = (product: PublicStorefrontProductDto, withAnchor = false) => (
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
      presentation={customization.layout.productPresentation}
    />
  );

  function renderSection(section: StoreSection) {
    if (section === 'CATEGORIES' && visibleCategories.length > 0) {
      return (
        <CategoryNav
          key={section}
          categories={visibleCategories.map((category) => ({
            id: category.id,
            name: category.name,
            imageAssetId: category.image?.id ?? null,
            imageUrl: category.image ? storeAssetUrl(category.image.id, 96) : null,
            imageAlt: category.image?.altText ?? null,
          }))}
          activeCategoryId={activeCategoryId}
          onCategoryClick={handleCategoryClick}
          variant={customization.layout.categoryNavigation}
          showImages={customization.layout.showCategoryImages}
        />
      );
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
          <div className="storefront-product-grid">
            {featuredProducts.map((product) => productCard(product))}
          </div>
        </section>
      );
    }

    if (section === 'CATALOG') {
      return (
        <main key={section} className="storefront-catalog" aria-busy={search !== deferredSearch}>
          {visibleCategories.length === 0 ? (
            <section className="storefront-empty" role="status" aria-live="polite">
              <SearchX className="storefront-empty-icon" aria-hidden="true" />
              <h2 className="storefront-empty-title">
                {deferredSearch.trim()
                  ? `Nenhum resultado para “${deferredSearch.trim()}”`
                  : 'Cardápio em atualização'}
              </h2>
              <p>
                {deferredSearch.trim()
                  ? 'Tente outro nome ou limpe a busca para navegar pelas categorias.'
                  : 'A loja ainda não publicou produtos disponíveis. Volte em breve.'}
              </p>
              {deferredSearch.trim() && (
                <button type="button" onClick={clearSearch} className="storefront-empty-action">
                  Limpar busca
                </button>
              )}
            </section>
          ) : (
            visibleCategories.map((category) => (
              <section
                key={category.id}
                id={`category-${category.id}`}
                data-category-id={category.id}
                className="storefront-category-section"
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
                <div className="storefront-product-grid">
                  {category.products.map((product) => productCard(product, true))}
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

  return (
    <>
      {customization.layout.showSearch && (
        <div className="storefront-search-wrap">
          <Search className="h-4 w-4" aria-hidden="true" />
          <label htmlFor="storefront-search" className="sr-only">
            Buscar no cardápio
          </label>
          <input
            ref={searchInputRef}
            id="storefront-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar no cardápio"
          />
        </div>
      )}

      {customization.layout.sectionOrder.map(renderSection)}

      {selectedProduct && (
        <ProductModal product={selectedProduct} onClose={closeProduct} storeOpen={storeOpen} />
      )}

      <CartFab storeId={storeId} />
    </>
  );
}

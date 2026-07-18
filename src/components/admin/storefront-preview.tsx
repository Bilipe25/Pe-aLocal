'use client';

import { useState } from 'react';

import { CategoryNav } from '@/components/storefront/category-nav';
import { ProductCard } from '@/components/storefront/product-card';
import { StoreHeader } from '@/components/storefront/store-header';
import type { AdminStoreAssetItem } from '@/components/admin/store-assets-manager';
import type { AdminStoreCategoryItem } from '@/components/admin/store-category-images-manager';
import { getStorefrontThemeStyle, storefrontLayoutClass } from '@/features/customization/theme';
import type { StoreCustomizationConfig } from '@/schemas/customization';

type PreviewMode = 'mobile' | 'tablet' | 'desktop';

const PREVIEW_MODES: Record<PreviewMode, { label: string; width: number }> = {
  mobile: { label: 'Celular', width: 390 },
  tablet: { label: 'Tablet', width: 768 },
  desktop: { label: 'Desktop', width: 1080 },
};

const PREVIEW_PRODUCTS = [
  {
    name: 'Especial da casa',
    description: 'Produto em destaque com ingredientes selecionados.',
    basePrice: 2490,
    isFeatured: true,
  },
  {
    name: 'Opção tradicional',
    description: 'Uma apresentação realista para validar o tema.',
    basePrice: 1890,
    isFeatured: false,
  },
] as const;

interface StorefrontPreviewProps {
  config: StoreCustomizationConfig;
  storeName: string;
  storeStatus: 'OPEN' | 'CLOSED' | 'PAUSED';
  logoUrl: string | null;
  coverUrl: string | null;
  categories: AdminStoreCategoryItem[];
  assets: AdminStoreAssetItem[];
}

export function StorefrontPreview({
  config,
  storeName,
  storeStatus,
  logoUrl,
  coverUrl,
  categories,
  assets,
}: StorefrontPreviewProps) {
  const [mode, setMode] = useState<PreviewMode>('mobile');
  const assetById = new Map(assets.map((asset) => [asset.id, asset]));
  const associationByCategoryId = new Map(
    config.categoryImages.map((association) => [association.categoryId, association.assetId]),
  );
  const previewCategories = categories
    .filter((category) => category.isActive)
    .slice(0, 4)
    .map((category) => {
      const asset = assetById.get(associationByCategoryId.get(category.id) ?? '');
      return {
        id: category.id,
        name: category.name,
        description: category.description,
        imageUrl: asset?.assetType === 'CATEGORY_IMAGE' ? asset.previewUrl : null,
        imageAlt: asset?.assetType === 'CATEGORY_IMAGE' ? asset.altText : null,
      };
    });
  const firstCategory = previewCategories[0] ?? null;

  return (
    <section className="border-border bg-surface rounded-xl border p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-text-primary font-semibold">Prévia responsiva</h2>
          <p className="text-text-secondary mt-1 text-xs">
            Usa o rascunho em memória, sem publicar.
          </p>
        </div>
        <div
          className="border-border flex rounded-lg border p-1"
          role="group"
          aria-label="Tamanho da prévia"
        >
          {(
            Object.entries(PREVIEW_MODES) as [PreviewMode, (typeof PREVIEW_MODES)[PreviewMode]][]
          ).map(([key, item]) => (
            <button
              key={key}
              type="button"
              aria-pressed={mode === key}
              onClick={() => setMode(key)}
              className={`rounded-md px-2 py-1 text-xs ${
                mode === key ? 'bg-brand-600 text-white' : 'text-text-secondary'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div
        className="border-border bg-surface-secondary mt-4 max-h-[42rem] overflow-auto rounded-lg border p-2"
        aria-label={`Prévia do cardápio em modo ${PREVIEW_MODES[mode].label.toLowerCase()}`}
      >
        <div
          className={`storefront-theme ${storefrontLayoutClass(config)} storefront-button-${config.typography.buttonStyle} mx-auto min-h-[34rem] overflow-hidden rounded-md shadow-sm`}
          style={{ ...getStorefrontThemeStyle(config), width: PREVIEW_MODES[mode].width }}
          data-preview-mode={mode}
          data-preview-layout={config.theme.layoutTemplate}
        >
          <StoreHeader
            name={storeName}
            description="Cardápio demonstrativo para revisar a personalização."
            status={storeStatus}
            estimatedTime="30–45 min"
            neighborhood="Centro"
            city="Sua cidade"
            logoUrl={logoUrl}
            coverUrl={coverUrl}
            config={config}
          />

          <CategoryNav
            categories={previewCategories}
            activeCategoryId={firstCategory?.id ?? null}
            onCategoryClick={() => undefined}
            variant={config.layout.categoryNavigation}
            showImages={config.layout.showCategoryImages}
          />

          <main className="storefront-catalog" aria-label="Produtos de exemplo">
            <section className="storefront-category-section">
              <div className="storefront-category-heading">
                {config.layout.showCategoryImages &&
                  config.layout.categoryNavigation === 'DROPDOWN' &&
                  firstCategory?.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={firstCategory.imageUrl}
                      alt={firstCategory.imageAlt ?? firstCategory.name}
                      width={72}
                      height={72}
                      className="storefront-category-heading-image"
                    />
                  )}
                <h3 className="storefront-section-title">
                  {firstCategory?.name ?? 'Produtos de exemplo'}
                </h3>
              </div>
              <div className="storefront-product-grid">
                {PREVIEW_PRODUCTS.map((product) => (
                  <ProductCard
                    key={product.name}
                    {...product}
                    imageUrl={null}
                    isSoldOut={false}
                    onClick={() => undefined}
                    showImage={config.layout.showProductImages}
                    showBadges={config.layout.showProductBadges}
                    presentation={config.layout.productPresentation}
                  />
                ))}
              </div>
            </section>
          </main>

          {config.platformBranding.showPedidoLocalBranding && (
            <footer className="storefront-branding px-4 py-8 text-center text-xs">
              Tecnologia por PedidoLocal
            </footer>
          )}
        </div>
      </div>
    </section>
  );
}

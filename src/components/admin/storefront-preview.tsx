'use client';

import { useState } from 'react';

import { CategoryNav } from '@/components/storefront/category-nav';
import { ProductCard } from '@/components/storefront/product-card';
import { StoreHeader } from '@/components/storefront/store-header';
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
}

export function StorefrontPreview({
  config,
  storeName,
  storeStatus,
  logoUrl,
  coverUrl,
}: StorefrontPreviewProps) {
  const [mode, setMode] = useState<PreviewMode>('mobile');

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
            categories={[
              { id: 'preview-featured', name: 'Destaques' },
              { id: 'preview-menu', name: 'Cardápio' },
            ]}
            activeCategoryId="preview-featured"
            onCategoryClick={() => undefined}
            variant={config.layout.categoryNavigation}
          />

          <main className="storefront-catalog" aria-label="Produtos de exemplo">
            <section className="storefront-category-section">
              <h3 className="storefront-section-title">Produtos de exemplo</h3>
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

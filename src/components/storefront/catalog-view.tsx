'use client';

import { useState, useEffect } from 'react';
import { CategoryNav } from '@/components/storefront/category-nav';
import { ProductCard } from '@/components/storefront/product-card';
import { ProductModal } from '@/components/storefront/product-modal';
import { CartFab } from '@/components/storefront/cart-fab';
import { useCartStore } from '@/stores/cart-store';

interface Option {
  id: string;
  name: string;
  price: number;
}

interface OptionGroup {
  id: string;
  title: string;
  description: string | null;
  isRequired: boolean;
  isMultiple: boolean;
  minSelections: number;
  maxSelections: number;
  options: Option[];
}

interface Product {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  basePrice: number;
  isFeatured: boolean;
  isSoldOut: boolean;
  allowNotes: boolean;
  optionGroups: OptionGroup[];
}

interface Category {
  id: string;
  name: string;
  description: string | null;
  products: Product[];
}

interface CatalogViewProps {
  categories: Category[];
  storeId: string;
  storeSlug: string;
  storeOpen: boolean;
}

export function CatalogView({ categories, storeId, storeSlug, storeOpen }: CatalogViewProps) {
  const setStore = useCartStore((s) => s.setStore);
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(
    categories[0]?.id ?? null,
  );
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  useEffect(() => {
    setStore(storeId, storeSlug);
  }, [storeId, storeSlug, setStore]);

  function handleCategoryClick(id: string) {
    setActiveCategoryId(id);
    const element = document.getElementById(`category-${id}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  // Intersection Observer para atualizar categoria ativa
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
    sections.forEach((s) => observer.observe(s));

    return () => observer.disconnect();
  }, [categories]);

  return (
    <>
      <CategoryNav
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
        activeCategoryId={activeCategoryId}
        onCategoryClick={handleCategoryClick}
      />

      <main className="mx-auto max-w-2xl px-4 pb-24 pt-4">
        {categories.map((category) => (
          <section
            key={category.id}
            id={`category-${category.id}`}
            data-category-id={category.id}
            className="mb-6 scroll-mt-16"
          >
            <h2 className="mb-3 font-display text-lg font-bold text-tinta">
              {category.name}
            </h2>
            <div className="space-y-2">
              {category.products.map((product) => (
                <ProductCard
                  key={product.id}
                  name={product.name}
                  description={product.description}
                  basePrice={product.basePrice}
                  isFeatured={product.isFeatured}
                  isSoldOut={product.isSoldOut}
                  imageUrl={product.imageUrl}
                  onClick={() => setSelectedProduct(product)}
                  disabled={!storeOpen}
                />
              ))}
            </div>
          </section>
        ))}
      </main>

      {/* Modal de produto */}
      {selectedProduct && (
        <ProductModal
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
          storeOpen={storeOpen}
        />
      )}

      {/* FAB do carrinho */}
      <CartFab />
    </>
  );
}

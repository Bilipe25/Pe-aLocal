'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { storeAssetSrcSet } from '@/features/assets/urls';
import type { StoreCustomizationConfig } from '@/schemas/customization';

interface CategoryNavProps {
  categories: {
    id: string;
    name: string;
    imageAssetId?: string | null;
    imageUrl: string | null;
    imageAlt: string | null;
  }[];
  activeCategoryId: string | null;
  onCategoryClick: (id: string) => void;
  variant: StoreCustomizationConfig['layout']['categoryNavigation'];
  showImages: boolean;
}

export function CategoryNav({
  categories,
  activeCategoryId,
  onCategoryClick,
  variant,
  showImages,
}: CategoryNavProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);
  const [overflow, setOverflow] = useState({ start: false, end: false });

  const updateOverflow = useCallback(() => {
    const container = scrollRef.current;
    if (!container) return;
    const hasOverflow = container.scrollWidth > container.clientWidth + 1;
    setOverflow({
      start: hasOverflow && container.scrollLeft > 2,
      end: hasOverflow && container.scrollLeft + container.clientWidth < container.scrollWidth - 2,
    });
  }, []);

  useEffect(() => {
    if (variant === 'HORIZONTAL_STICKY' && activeRef.current && scrollRef.current) {
      const container = scrollRef.current;
      const active = activeRef.current;
      const left = active.offsetLeft - container.offsetWidth / 2 + active.offsetWidth / 2;
      if (typeof container.scrollTo === 'function') {
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        container.scrollTo({ left, behavior: reduceMotion ? 'auto' : 'smooth' });
      }
    }
    updateOverflow();
  }, [activeCategoryId, updateOverflow, variant]);

  useEffect(() => {
    updateOverflow();
    if (typeof ResizeObserver === 'undefined' || !scrollRef.current) return;
    const observer = new ResizeObserver(updateOverflow);
    observer.observe(scrollRef.current);
    return () => observer.disconnect();
  }, [categories, updateOverflow]);

  if (variant === 'DROPDOWN') {
    return (
      <div className="storefront-category-dropdown">
        <label htmlFor="storefront-category" className="sr-only">
          Ir para categoria
        </label>
        <select
          id="storefront-category"
          value={activeCategoryId ?? ''}
          onChange={(event) => onCategoryClick(event.target.value)}
        >
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <nav
      aria-label="Categorias do cardápio"
      className={`storefront-category-nav ${
        variant === 'VERTICAL' ? 'storefront-category-nav-vertical' : ''
      } ${overflow.start ? 'can-scroll-start' : ''} ${overflow.end ? 'can-scroll-end' : ''}`}
    >
      <div
        ref={scrollRef}
        className="storefront-category-list scrollbar-hide"
        onScroll={updateOverflow}
      >
        {categories.map((category) => {
          const isActive = category.id === activeCategoryId;
          return (
            <button
              type="button"
              key={category.id}
              ref={isActive ? activeRef : undefined}
              onClick={() => onCategoryClick(category.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`storefront-category-button ${showImages && category.imageUrl ? 'has-image' : ''} ${isActive ? 'is-active' : ''}`}
            >
              {showImages && category.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={category.imageUrl}
                  srcSet={
                    category.imageAssetId
                      ? storeAssetSrcSet(category.imageAssetId, [96, 192])
                      : undefined
                  }
                  sizes="52px"
                  alt=""
                  width={52}
                  height={52}
                  loading="lazy"
                  decoding="async"
                  onError={(event) => {
                    event.currentTarget.hidden = true;
                  }}
                  className="storefront-category-thumbnail"
                />
              )}
              {category.name}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

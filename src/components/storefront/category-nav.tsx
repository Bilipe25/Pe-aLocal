'use client';

import { useEffect, useRef } from 'react';

import type { StoreCustomizationConfig } from '@/schemas/customization';

interface CategoryNavProps {
  categories: {
    id: string;
    name: string;
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

  useEffect(() => {
    if (variant === 'HORIZONTAL_STICKY' && activeRef.current && scrollRef.current) {
      const container = scrollRef.current;
      const active = activeRef.current;
      const left = active.offsetLeft - container.offsetWidth / 2 + active.offsetWidth / 2;
      if (typeof container.scrollTo === 'function') {
        container.scrollTo({ left, behavior: 'smooth' });
      }
    }
  }, [activeCategoryId, variant]);

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
      className={`storefront-category-nav ${variant === 'VERTICAL' ? 'storefront-category-nav-vertical' : ''}`}
    >
      <div ref={scrollRef} className="storefront-category-list scrollbar-hide">
        {categories.map((category) => {
          const isActive = category.id === activeCategoryId;
          return (
            <button
              type="button"
              key={category.id}
              ref={isActive ? activeRef : undefined}
              onClick={() => onCategoryClick(category.id)}
              aria-current={isActive ? 'true' : undefined}
              className={`storefront-category-button ${showImages && category.imageUrl ? 'has-image' : ''} ${isActive ? 'is-active' : ''}`}
            >
              {showImages && category.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={category.imageUrl}
                  alt=""
                  width={52}
                  height={52}
                  loading="lazy"
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

'use client';

import { Search, SlidersHorizontal } from 'lucide-react';
import type { ChangeEvent, RefObject } from 'react';

interface StorefrontSearchProps {
  value: string;
  onChange: (value: string) => void;
  inputRef?: RefObject<HTMLInputElement | null>;
  onFilterClick?: () => void;
  activeFilterCount?: number;
}

export function StorefrontSearch({
  value,
  onChange,
  inputRef,
  onFilterClick,
  activeFilterCount = 0,
}: StorefrontSearchProps) {
  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    onChange(event.target.value);
  }

  return (
    <div className="storefront-search-shell" role="search">
      <div className="storefront-search-wrap">
        <Search aria-hidden="true" />
        <label htmlFor="storefront-search" className="sr-only">
          Buscar no cardápio
        </label>
        <input
          ref={inputRef}
          id="storefront-search"
          type="search"
          value={value}
          onChange={handleChange}
          placeholder="Buscar no cardápio"
          autoComplete="off"
        />
      </div>
      {onFilterClick && (
        <button
          type="button"
          onClick={onFilterClick}
          className="storefront-filter-trigger"
          aria-label={
            activeFilterCount > 0
              ? `Abrir filtros, ${activeFilterCount} ativo${activeFilterCount > 1 ? 's' : ''}`
              : 'Abrir filtros'
          }
        >
          <SlidersHorizontal aria-hidden="true" />
          {activeFilterCount > 0 && (
            <span className="storefront-filter-count" aria-hidden="true">
              {activeFilterCount}
            </span>
          )}
        </button>
      )}
    </div>
  );
}

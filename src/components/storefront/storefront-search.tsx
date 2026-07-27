'use client';

import { Search, SlidersHorizontal, X } from 'lucide-react';
import type { ChangeEvent, RefObject } from 'react';

interface StorefrontSearchProps {
  value: string;
  onChange: (value: string) => void;
  inputRef?: RefObject<HTMLInputElement | null>;
  onFilterClick?: () => void;
  activeFilterCount?: number;
  isBusy?: boolean;
}

export function StorefrontSearch({
  value,
  onChange,
  inputRef,
  onFilterClick,
  activeFilterCount = 0,
  isBusy = false,
}: StorefrontSearchProps) {
  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    onChange(event.target.value);
  }

  function handleClear() {
    onChange('');
    requestAnimationFrame(() => inputRef?.current?.focus());
  }

  return (
    <div className="storefront-search-shell" role="search">
      <div
        className={`storefront-search-wrap ${isBusy ? 'is-busy' : ''}`}
        aria-busy={isBusy || undefined}
      >
        <Search className="storefront-search-icon" aria-hidden="true" />
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
        {value.length > 0 && (
          <button
            type="button"
            className="storefront-search-clear"
            onClick={handleClear}
            aria-label="Limpar busca"
          >
            <X aria-hidden="true" />
          </button>
        )}
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

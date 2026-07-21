'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import { Search, X } from 'lucide-react';

interface CatalogSearchBarProps {
  /** Chamado com o termo de busca (debounced 200ms) */
  onSearch: (query: string) => void;
  placeholder?: string;
}

/**
 * Barra de busca do catálogo com debounce de 200ms.
 * Filtragem é feita client-side pelo componente pai.
 */
export function CatalogSearchBar({
  onSearch,
  placeholder = 'Buscar produto ou categoria…',
}: CatalogSearchBarProps) {
  const [value, setValue] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const q = e.target.value;
      setValue(q);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => onSearch(q), 200);
    },
    [onSearch],
  );

  const handleClear = useCallback(() => {
    setValue('');
    onSearch('');
  }, [onSearch]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <div className="relative w-full max-w-sm">
      <Search
        className="text-text-tertiary absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2"
        aria-hidden="true"
      />
      <input
        type="search"
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        aria-label="Buscar no catálogo"
        className="border-border bg-surface text-text-primary placeholder:text-text-tertiary focus:ring-brand-500 h-9 w-full rounded-lg border py-2 pr-8 pl-9 text-sm focus:ring-2 focus:ring-offset-1 focus:outline-none"
      />
      {value && (
        <button
          type="button"
          onClick={handleClear}
          aria-label="Limpar busca"
          className="text-text-tertiary hover:text-text-secondary absolute top-1/2 right-2 -translate-y-1/2"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

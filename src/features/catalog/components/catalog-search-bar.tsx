'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CatalogSearchBarProps {
  /** Chamado com o termo de busca (debounced 200ms) */
  onSearch: (query: string) => void;
  placeholder?: string;
  className?: string;
}

/**
 * Barra de busca do catálogo com debounce de 200ms.
 * Filtragem é feita client-side pelo componente pai.
 */
export function CatalogSearchBar({
  onSearch,
  placeholder = 'Buscar produto ou categoria…',
  className,
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
    <div className={cn('relative w-full max-w-sm', className)}>
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
        aria-controls="catalog-results"
        className="border-border bg-surface text-text-primary placeholder:text-text-muted focus:ring-brand-500 h-11 w-full rounded-lg border py-2 pr-11 pl-9 text-sm focus:ring-2 focus:ring-offset-2 focus:outline-none"
      />
      {value && (
        <button
          type="button"
          onClick={handleClear}
          aria-label="Limpar busca"
          className="text-text-muted hover:bg-surface-secondary hover:text-text-primary focus-visible:ring-brand-500 absolute top-1/2 right-0 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-lg transition-colors focus-visible:ring-2 focus-visible:outline-none"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

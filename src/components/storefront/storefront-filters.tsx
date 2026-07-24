'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { Check, X } from 'lucide-react';
import { useState } from 'react';

import type { CatalogSort } from '@/features/storefront/catalog-filter';

interface StorefrontFiltersProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sort: CatalogSort;
  onlyAvailable: boolean;
  onApply: (filters: { sort: CatalogSort; onlyAvailable: boolean }) => void;
}

const SORT_OPTIONS: { value: CatalogSort; label: string; description: string }[] = [
  {
    value: 'RELEVANCE',
    label: 'Relevância',
    description: 'Disponíveis e destaques primeiro.',
  },
  {
    value: 'PRICE_ASC',
    label: 'Menor preço',
    description: 'Do menor para o maior valor.',
  },
  {
    value: 'PRICE_DESC',
    label: 'Maior preço',
    description: 'Do maior para o menor valor.',
  },
];

function FilterContent({
  initialSort,
  initialOnlyAvailable,
  onApply,
  onClose,
}: {
  initialSort: CatalogSort;
  initialOnlyAvailable: boolean;
  onApply: StorefrontFiltersProps['onApply'];
  onClose: () => void;
}) {
  const [draftSort, setDraftSort] = useState(initialSort);
  const [draftOnlyAvailable, setDraftOnlyAvailable] = useState(initialOnlyAvailable);
  const hasDraftFilters = draftSort !== 'RELEVANCE' || draftOnlyAvailable;

  function apply() {
    onApply({ sort: draftSort, onlyAvailable: draftOnlyAvailable });
    onClose();
  }

  return (
    <>
      <div className="storefront-filter-heading">
        <div>
          <Dialog.Title className="storefront-filter-title">Filtrar cardápio</Dialog.Title>
          <Dialog.Description className="storefront-filter-description">
            Ajuste a ordem e escolha quais produtos deseja ver.
          </Dialog.Description>
        </div>
        <Dialog.Close className="storefront-filter-close" aria-label="Fechar filtros">
          <X aria-hidden="true" />
        </Dialog.Close>
      </div>

      <div className="storefront-filter-body">
        <fieldset className="storefront-filter-group">
          <legend>Ordenar por</legend>
          <div className="storefront-filter-options">
            {SORT_OPTIONS.map((option) => (
              <label key={option.value} className="storefront-filter-option">
                <input
                  type="radio"
                  name="catalog-sort"
                  value={option.value}
                  checked={draftSort === option.value}
                  onChange={() => setDraftSort(option.value)}
                />
                <span className="storefront-filter-radio" aria-hidden="true">
                  <Check />
                </span>
                <span>
                  <strong>{option.label}</strong>
                  <small>{option.description}</small>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <label className="storefront-filter-availability">
          <span>
            <strong>Somente disponíveis</strong>
            <small>Oculta temporariamente os produtos esgotados.</small>
          </span>
          <input
            type="checkbox"
            checked={draftOnlyAvailable}
            onChange={(event) => setDraftOnlyAvailable(event.target.checked)}
          />
          <span className="storefront-filter-switch" aria-hidden="true" />
        </label>
      </div>

      <div className="storefront-filter-actions">
        <button
          type="button"
          className="storefront-filter-clear"
          onClick={() => {
            setDraftSort('RELEVANCE');
            setDraftOnlyAvailable(false);
          }}
          disabled={!hasDraftFilters}
        >
          Limpar
        </button>
        <button type="button" className="storefront-filter-apply" onClick={apply}>
          Aplicar filtros
        </button>
      </div>
    </>
  );
}

export function StorefrontFilters({
  open,
  onOpenChange,
  sort,
  onlyAvailable,
  onApply,
}: StorefrontFiltersProps) {
  const portalContainer =
    typeof document === 'undefined'
      ? undefined
      : (document.querySelector<HTMLElement>('.storefront-theme') ?? undefined);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal container={portalContainer}>
        <Dialog.Overlay className="storefront-filter-overlay" />
        <Dialog.Content className="storefront-filter-dialog">
          {open && (
            <FilterContent
              initialSort={sort}
              initialOnlyAvailable={onlyAvailable}
              onApply={onApply}
              onClose={() => onOpenChange(false)}
            />
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

'use client';

import type { KeyboardEvent } from 'react';

import { formatCurrency } from '@/lib/utils';
import type { SelectedOption } from '@/stores/cart-store';
import type { PublicStorefrontOptionGroupDto } from '@/types/storefront';

interface OptionGroupSelectorProps {
  group: PublicStorefrontOptionGroupDto;
  selected: SelectedOption[];
  onChange: (selected: SelectedOption[]) => void;
}

export function OptionGroupSelector({ group, selected, onChange }: OptionGroupSelectorProps) {
  const selectedIds = new Set(selected.map((option) => option.id));
  const titleId = `option-group-${group.id}-title`;
  const helpId = `option-group-${group.id}-help`;

  function handleToggle(option: { id: string; name: string; price: number }) {
    if (group.isMultiple) {
      if (selectedIds.has(option.id)) {
        onChange(selected.filter((selectedOption) => selectedOption.id !== option.id));
      } else if (selected.length < group.maxSelections) {
        onChange([...selected, option]);
      }
      return;
    }

    onChange(selectedIds.has(option.id) && !group.isRequired ? [] : [option]);
  }

  function handleSingleChoiceKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const lastIndex = group.options.length - 1;
    let nextIndex: number | null = null;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      nextIndex = index === lastIndex ? 0 : index + 1;
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      nextIndex = index === 0 ? lastIndex : index - 1;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = lastIndex;
    }
    if (nextIndex === null) return;

    event.preventDefault();
    const nextOption = group.options[nextIndex];
    if (!nextOption) return;
    onChange([nextOption]);
    const radios =
      event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]');
    radios?.[nextIndex]?.focus();
  }

  return (
    <section className="py-3" aria-labelledby={titleId}>
      <div className="mb-2 flex items-center justify-between">
        <div className="min-w-0 pr-2">
          <h3 id={titleId} className="text-tinta text-sm font-semibold">
            {group.title}
          </h3>
          {group.description && (
            <p className="text-text-muted text-sm break-words">{group.description}</p>
          )}
        </div>
        {group.isRequired ? (
          <span className="storefront-selection-badge shrink-0 rounded-full px-2 py-0.5 text-sm font-semibold">
            Obrigatório
          </span>
        ) : (
          <span className="text-text-muted shrink-0 text-sm">Opcional</span>
        )}
      </div>

      {group.isMultiple && (
        <p id={helpId} className="text-text-muted mb-1.5 text-sm">
          Escolha até {group.maxSelections}
          {group.minSelections > 0 && ` (mín. ${group.minSelections})`}
        </p>
      )}

      <div
        className="space-y-1"
        role={group.isMultiple ? 'group' : 'radiogroup'}
        aria-labelledby={titleId}
        aria-describedby={group.isMultiple ? helpId : undefined}
        aria-required={!group.isMultiple && group.isRequired ? 'true' : undefined}
      >
        {group.options.map((option, optionIndex) => {
          const isSelected = selectedIds.has(option.id);
          const reachedLimit =
            group.isMultiple && !isSelected && selected.length >= group.maxSelections;

          return (
            <button
              key={option.id}
              type="button"
              role={group.isMultiple ? 'checkbox' : 'radio'}
              aria-checked={isSelected}
              tabIndex={
                group.isMultiple
                  ? undefined
                  : isSelected || (selected.length === 0 && optionIndex === 0)
                    ? 0
                    : -1
              }
              disabled={reachedLimit}
              onClick={() => handleToggle(option)}
              onKeyDown={(event) => {
                if (!group.isMultiple) handleSingleChoiceKeyDown(event, optionIndex);
              }}
              className={`flex min-h-11 w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                isSelected ? 'storefront-selection-row text-tinta' : 'text-tinta hover:bg-tinta/5'
              }`}
            >
              <span className="flex min-w-0 items-center gap-2">
                <span
                  aria-hidden="true"
                  className={`flex h-4 w-4 shrink-0 items-center justify-center border ${
                    group.isMultiple ? 'rounded-sm' : 'rounded-full'
                  } ${isSelected ? 'storefront-selection-indicator' : 'border-tinta/25'}`}
                >
                  {isSelected && (
                    <span
                      className={`storefront-selection-mark h-2 w-2 ${group.isMultiple ? 'rounded-sm' : 'rounded-full'}`}
                    />
                  )}
                </span>
                <span className="text-left break-words">{option.name}</span>
              </span>
              {option.price > 0 && (
                <span className="text-text-muted shrink-0 pl-2 font-mono text-sm font-bold">
                  +{formatCurrency(option.price)}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}

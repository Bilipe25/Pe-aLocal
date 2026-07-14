'use client';

import { formatCurrency } from '@/lib/utils';
import type { SelectedOption } from '@/stores/cart-store';

interface OptionGroup {
  id: string;
  title: string;
  description: string | null;
  isRequired: boolean;
  isMultiple: boolean;
  minSelections: number;
  maxSelections: number;
  options: { id: string; name: string; price: number }[];
}

interface OptionGroupSelectorProps {
  group: OptionGroup;
  selected: SelectedOption[];
  onChange: (selected: SelectedOption[]) => void;
}

export function OptionGroupSelector({ group, selected, onChange }: OptionGroupSelectorProps) {
  const selectedIds = new Set(selected.map((o) => o.id));

  function handleToggle(option: { id: string; name: string; price: number }) {
    if (group.isMultiple) {
      // Checkbox behavior
      if (selectedIds.has(option.id)) {
        onChange(selected.filter((o) => o.id !== option.id));
      } else if (selected.length < group.maxSelections) {
        onChange([...selected, option]);
      }
    } else {
      // Radio behavior
      if (selectedIds.has(option.id)) {
        onChange([]);
      } else {
        onChange([option]);
      }
    }
  }

  return (
    <div className="py-3">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-tinta">{group.title}</h3>
          {group.description && (
            <p className="text-xs text-tinta/50">{group.description}</p>
          )}
        </div>
        {group.isRequired ? (
          <span className="rounded-full bg-pimenta/10 px-2 py-0.5 text-[10px] font-semibold text-pimenta">
            Obrigatório
          </span>
        ) : (
          <span className="text-[10px] text-tinta/40">Opcional</span>
        )}
      </div>

      {group.isMultiple && (
        <p className="mb-1.5 text-[10px] text-tinta/40">
          Escolha até {group.maxSelections}
          {group.minSelections > 0 && ` (mín. ${group.minSelections})`}
        </p>
      )}

      <div className="space-y-1">
        {group.options.map((option) => {
          const isSelected = selectedIds.has(option.id);
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => handleToggle(option)}
              className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors ${
                isSelected
                  ? 'bg-pimenta/10 text-tinta'
                  : 'text-tinta/80 hover:bg-tinta/5'
              }`}
            >
              <div className="flex items-center gap-2">
                {/* Indicador radio/checkbox */}
                <div
                  className={`flex h-4 w-4 items-center justify-center rounded-${group.isMultiple ? 'sm' : 'full'} border ${
                    isSelected
                      ? 'border-pimenta bg-pimenta'
                      : 'border-tinta/25'
                  }`}
                >
                  {isSelected && (
                    <div className={`h-2 w-2 rounded-${group.isMultiple ? 'px' : 'full'} bg-white`} />
                  )}
                </div>
                <span>{option.name}</span>
              </div>
              {option.price > 0 && (
                <span className="font-mono text-xs font-bold text-tinta/60">
                  +{formatCurrency(option.price)}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

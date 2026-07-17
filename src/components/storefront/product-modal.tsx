'use client';

import { useState, useCallback } from 'react';
import { X, Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { formatCurrency } from '@/lib/utils';
import { OptionGroupSelector } from './option-group-selector';
import { useCartStore, type SelectedOption } from '@/stores/cart-store';

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

interface Product {
  id: string;
  name: string;
  description: string | null;
  basePrice: number;
  allowNotes: boolean;
  optionGroups: OptionGroup[];
}

interface ProductModalProps {
  product: Product;
  onClose: () => void;
  storeOpen: boolean;
}

export function ProductModal({ product, onClose, storeOpen }: ProductModalProps) {
  const addItem = useCartStore((s) => s.addItem);
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState('');
  const [selectedOptions, setSelectedOptions] = useState<Map<string, SelectedOption[]>>(new Map());

  const handleOptionChange = useCallback(
    (groupId: string, options: SelectedOption[]) => {
      setSelectedOptions((prev) => {
        const next = new Map(prev);
        next.set(groupId, options);
        return next;
      });
    },
    [],
  );

  // Calcular preço
  const allSelectedOptions = Array.from(selectedOptions.values()).flat();
  const optionsPrice = allSelectedOptions.reduce((sum, o) => sum + o.price, 0);
  const unitPrice = product.basePrice + optionsPrice;
  const totalPrice = unitPrice * quantity;

  // Validar obrigatórios
  const missingRequired = product.optionGroups
    .filter((g) => g.isRequired)
    .some((g) => {
      const selected = selectedOptions.get(g.id) ?? [];
      return selected.length < g.minSelections;
    });

  function handleAdd() {
    addItem({
      productId: product.id,
      productName: product.name,
      basePrice: product.basePrice,
      quantity,
      notes,
      selectedOptions: allSelectedOptions,
      unitPrice,
    });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      {/* Overlay */}
      <div className="fixed inset-0 bg-tinta/40 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-t-2xl bg-papel shadow-lg sm:rounded-2xl">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-tinta/10 bg-papel px-4 py-3">
          <div>
            <h2 className="font-display text-lg font-bold text-tinta">{product.name}</h2>
            {product.description && (
              <p className="mt-0.5 text-sm text-tinta/60">{product.description}</p>
            )}
            <p className="mt-1 font-mono text-base font-bold text-pimenta">
              {formatCurrency(product.basePrice)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-tinta/50 transition-colors hover:bg-tinta/5 hover:text-tinta"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Option Groups */}
        {product.optionGroups.length > 0 && (
          <div className="divide-y divide-tinta/5 px-4">
            {product.optionGroups.map((group) => (
              <OptionGroupSelector
                key={group.id}
                group={group}
                selected={selectedOptions.get(group.id) ?? []}
                onChange={(opts) => handleOptionChange(group.id, opts)}
              />
            ))}
          </div>
        )}

        {/* Notes */}
        {product.allowNotes && (
          <div className="border-t border-tinta/5 px-4 py-3">
            <label className="text-sm font-medium text-tinta/70">Observações</label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex: Sem cebola, molho à parte..."
              rows={2}
              className="mt-1 bg-papel border-tinta/15 text-tinta placeholder:text-tinta/40 focus-visible:ring-pimenta focus-visible:ring-offset-papel"
            />
          </div>
        )}

        {/* Footer: Quantidade + Adicionar */}
        <div className="sticky bottom-0 border-t border-tinta/10 bg-papel px-4 py-3">
          <div className="flex items-center gap-4">
            {/* Quantidade */}
            <div className="flex items-center gap-2 rounded-full border border-tinta/15 px-1">
              <button
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                className="rounded-full p-1.5 text-tinta/60 hover:bg-tinta/5"
                disabled={quantity <= 1}
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="w-6 text-center font-mono text-sm font-bold text-tinta">
                {quantity}
              </span>
              <button
                onClick={() => setQuantity((q) => q + 1)}
                className="rounded-full p-1.5 text-tinta/60 hover:bg-tinta/5"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>

            {/* Botão Adicionar */}
            <Button
              onClick={handleAdd}
              disabled={!storeOpen || missingRequired}
              className="storefront-primary-action flex-1 font-body font-medium shadow-sm disabled:opacity-50"
            >
              Adicionar · {formatCurrency(totalPrice)}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

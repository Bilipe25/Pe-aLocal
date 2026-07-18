'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { Minus, Plus, X } from 'lucide-react';
import { useCallback, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { formatCurrency } from '@/lib/utils';
import { useCartStore, type SelectedOption } from '@/stores/cart-store';

import { OptionGroupSelector } from './option-group-selector';

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
  const addItem = useCartStore((state) => state.addItem);
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState('');
  const [selectedOptions, setSelectedOptions] = useState<Map<string, SelectedOption[]>>(
    new Map(),
  );

  const handleOptionChange = useCallback((groupId: string, options: SelectedOption[]) => {
    setSelectedOptions((previous) => {
      const next = new Map(previous);
      next.set(groupId, options);
      return next;
    });
  }, []);

  const allSelectedOptions = Array.from(selectedOptions.values()).flat();
  const optionsPrice = allSelectedOptions.reduce((sum, option) => sum + option.price, 0);
  const unitPrice = product.basePrice + optionsPrice;
  const totalPrice = unitPrice * quantity;

  const missingRequired = product.optionGroups
    .filter((group) => group.isRequired)
    .some((group) => (selectedOptions.get(group.id) ?? []).length < group.minSelections);
  const portalContainer =
    typeof document === 'undefined'
      ? undefined
      : (document.querySelector<HTMLElement>('.storefront-theme') ?? undefined);

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
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal container={portalContainer}>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-tinta/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 mx-auto max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-papel shadow-lg focus:outline-none sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2 sm:rounded-2xl">
          <div className="sticky top-0 z-10 flex items-start justify-between border-b border-tinta/10 bg-papel px-4 py-3">
            <div className="min-w-0 pr-2">
              <Dialog.Title className="break-words font-display text-lg font-bold text-tinta">
                {product.name}
              </Dialog.Title>
              {product.description ? (
                <Dialog.Description className="mt-0.5 break-words text-sm text-text-muted">
                  {product.description}
                </Dialog.Description>
              ) : (
                <Dialog.Description className="sr-only">
                  Configure as opções e a quantidade antes de adicionar o produto à sacola.
                </Dialog.Description>
              )}
              <p className="storefront-action-text mt-1 font-mono text-base font-bold">
                {formatCurrency(product.basePrice)}
              </p>
            </div>
            <Dialog.Close
              aria-label={`Fechar detalhes de ${product.name}`}
              className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-tinta/5 hover:text-tinta"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </Dialog.Close>
          </div>

          {product.optionGroups.length > 0 && (
            <div className="divide-y divide-tinta/5 px-4">
              {product.optionGroups.map((group) => (
                <OptionGroupSelector
                  key={group.id}
                  group={group}
                  selected={selectedOptions.get(group.id) ?? []}
                  onChange={(options) => handleOptionChange(group.id, options)}
                />
              ))}
            </div>
          )}

          {product.allowNotes && (
            <div className="border-t border-tinta/5 px-4 py-3">
              <label htmlFor="product-notes" className="text-sm font-medium text-text-muted">
                Observações
              </label>
              <Textarea
                id="product-notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Ex: Sem cebola, molho à parte..."
                rows={2}
                className="mt-1 min-h-11 border-tinta/15 bg-papel text-tinta placeholder:text-text-muted focus-visible:ring-pimenta focus-visible:ring-offset-papel"
              />
            </div>
          )}

          <div className="storefront-safe-bottom sticky bottom-0 border-t border-tinta/10 bg-papel px-4 py-3">
            {missingRequired && (
              <p id="required-options-message" role="status" className="mb-2 text-sm text-text-muted">
                Selecione os complementos obrigatórios para continuar.
              </p>
            )}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1 rounded-full border border-tinta/15 px-1">
                <button
                  type="button"
                  aria-label="Diminuir quantidade"
                  onClick={() => setQuantity((current) => Math.max(1, current - 1))}
                  className="flex min-h-11 min-w-11 items-center justify-center rounded-full text-text-muted hover:bg-tinta/5"
                  disabled={quantity <= 1}
                >
                  <Minus className="h-4 w-4" aria-hidden="true" />
                </button>
                <span className="w-6 text-center font-mono text-sm font-bold text-tinta">
                  {quantity}
                </span>
                <button
                  type="button"
                  aria-label="Aumentar quantidade"
                  onClick={() => setQuantity((current) => current + 1)}
                  className="flex min-h-11 min-w-11 items-center justify-center rounded-full text-text-muted hover:bg-tinta/5"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>

              <Button
                onClick={handleAdd}
                disabled={!storeOpen || missingRequired}
                aria-describedby={missingRequired ? 'required-options-message' : undefined}
                className="storefront-primary-action flex-1 font-body font-medium shadow-sm disabled:opacity-50"
              >
                Adicionar · {formatCurrency(totalPrice)}
              </Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

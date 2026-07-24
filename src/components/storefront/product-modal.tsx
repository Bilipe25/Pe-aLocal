'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { Heart, Minus, Plus, X } from 'lucide-react';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { formatCurrency } from '@/lib/utils';
import { MAX_CART_ITEM_QUANTITY, useCartStore, type SelectedOption } from '@/stores/cart-store';
import type { PublicStorefrontProductDto } from '@/types/storefront';

import { OptionGroupSelector } from './option-group-selector';

interface ProductModalProps {
  product: PublicStorefrontProductDto;
  onClose: () => void;
  storeOpen: boolean;
  isFavorite?: boolean;
  onFavoriteToggle?: () => void;
}

export function ProductModal({
  product,
  onClose,
  storeOpen,
  isFavorite = false,
  onFavoriteToggle,
}: ProductModalProps) {
  const addItem = useCartStore((state) => state.addItem);
  const removeQuantity = useCartStore((state) => state.removeQuantity);
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState('');
  const [selectedOptions, setSelectedOptions] = useState<Map<string, SelectedOption[]>>(new Map());

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
    const result = addItem({
      productId: product.id,
      productName: product.name,
      basePrice: product.basePrice,
      quantity,
      notes,
      selectedOptions: allSelectedOptions,
      unitPrice,
    });
    if (result.quantityAdded === 0) {
      toast.error('Limite de 99 unidades atingido', {
        description: 'Reduza a quantidade na sacola antes de adicionar mais deste item.',
      });
      return;
    }
    toast.success('Adicionado à sacola', {
      description: `${result.quantityAdded} ${
        result.quantityAdded === 1 ? 'unidade' : 'unidades'
      } de ${product.name}.`,
      action: {
        label: 'Desfazer',
        onClick: () => removeQuantity(result.itemId, result.quantityAdded),
      },
      duration: 6000,
    });
    onClose();
  }

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal container={portalContainer}>
        <Dialog.Overlay className="bg-tinta/40 fixed inset-0 z-50 backdrop-blur-sm" />
        <Dialog.Content className="bg-papel fixed inset-x-0 bottom-0 z-50 mx-auto max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl shadow-lg focus:outline-none sm:top-1/2 sm:bottom-auto sm:-translate-y-1/2 sm:rounded-2xl">
          <div className="border-tinta/10 bg-papel sticky top-0 z-10 flex items-start justify-between border-b px-4 py-3">
            <div className="min-w-0 pr-2">
              <Dialog.Title className="font-display text-tinta text-lg font-bold break-words">
                {product.name}
              </Dialog.Title>
              {product.description ? (
                <Dialog.Description className="text-text-muted mt-0.5 text-sm break-words">
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
            <div className="flex shrink-0 items-center">
              {onFavoriteToggle && (
                <button
                  type="button"
                  onClick={onFavoriteToggle}
                  aria-label={
                    isFavorite
                      ? `Remover ${product.name} dos favoritos`
                      : `Favoritar ${product.name}`
                  }
                  aria-pressed={isFavorite}
                  className={`storefront-product-modal-favorite ${isFavorite ? 'is-active' : ''}`}
                >
                  <Heart className="h-5 w-5" aria-hidden="true" />
                </button>
              )}
              <Dialog.Close
                aria-label={`Fechar detalhes de ${product.name}`}
                className="text-text-muted hover:bg-tinta/5 hover:text-tinta flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full transition-colors"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </Dialog.Close>
            </div>
          </div>

          {product.optionGroups.length > 0 && (
            <div className="divide-tinta/5 divide-y px-4">
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
            <div className="border-tinta/5 border-t px-4 py-3">
              <label htmlFor="product-notes" className="text-text-muted text-sm font-medium">
                Observações
              </label>
              <Textarea
                id="product-notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Ex: Sem cebola, molho à parte..."
                rows={2}
                className="border-tinta/15 bg-papel text-tinta placeholder:text-text-muted focus-visible:ring-pimenta focus-visible:ring-offset-papel mt-1 min-h-11"
              />
            </div>
          )}

          <div className="storefront-safe-bottom border-tinta/10 bg-papel sticky bottom-0 border-t px-4 py-3">
            {!storeOpen && (
              <p
                id="store-closed-product-message"
                role="status"
                className="text-text-muted mb-2 text-sm"
              >
                A loja está fechada agora. Consulte o produto e volte quando os pedidos reabrirem.
              </p>
            )}
            {storeOpen && missingRequired && (
              <p
                id="required-options-message"
                role="status"
                className="text-text-muted mb-2 text-sm"
              >
                Selecione os complementos obrigatórios para continuar.
              </p>
            )}
            {quantity >= MAX_CART_ITEM_QUANTITY && (
              <p id="product-quantity-limit" role="status" className="text-text-muted mb-2 text-sm">
                Limite de {MAX_CART_ITEM_QUANTITY} unidades por item atingido.
              </p>
            )}
            <div className="flex items-center gap-4">
              <div className="border-tinta/15 flex items-center gap-1 rounded-full border px-1">
                <button
                  type="button"
                  aria-label="Diminuir quantidade"
                  onClick={() => setQuantity((current) => Math.max(1, current - 1))}
                  className="text-text-muted hover:bg-tinta/5 flex min-h-11 min-w-11 items-center justify-center rounded-full"
                  disabled={quantity <= 1}
                >
                  <Minus className="h-4 w-4" aria-hidden="true" />
                </button>
                <span className="text-tinta w-6 text-center font-mono text-sm font-bold">
                  {quantity}
                </span>
                <button
                  type="button"
                  aria-label="Aumentar quantidade"
                  aria-describedby={
                    quantity >= MAX_CART_ITEM_QUANTITY ? 'product-quantity-limit' : undefined
                  }
                  onClick={() =>
                    setQuantity((current) => Math.min(MAX_CART_ITEM_QUANTITY, current + 1))
                  }
                  disabled={quantity >= MAX_CART_ITEM_QUANTITY}
                  className="text-text-muted hover:bg-tinta/5 flex min-h-11 min-w-11 items-center justify-center rounded-full"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>

              <Button
                onClick={handleAdd}
                disabled={!storeOpen || missingRequired}
                aria-describedby={
                  !storeOpen
                    ? 'store-closed-product-message'
                    : missingRequired
                      ? 'required-options-message'
                      : undefined
                }
                className="storefront-primary-action font-body flex-1 font-medium shadow-sm disabled:opacity-50"
              >
                {storeOpen ? `Adicionar · ${formatCurrency(totalPrice)}` : 'Loja fechada'}
              </Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

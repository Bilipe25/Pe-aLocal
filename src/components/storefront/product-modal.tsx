'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { Heart, Minus, Plus, X } from 'lucide-react';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import { ProductImage } from '@/components/storefront/product-image';
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
  const hasProductImage = Boolean(product.imageAssetId || product.imageUrl);

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

  const modalActions = (
    <div className="storefront-product-modal-actions">
      {onFavoriteToggle && (
        <button
          type="button"
          onClick={onFavoriteToggle}
          aria-label={
            isFavorite ? `Remover ${product.name} dos favoritos` : `Favoritar ${product.name}`
          }
          aria-pressed={isFavorite}
          className={`storefront-product-modal-favorite ${isFavorite ? 'is-active' : ''}`}
        >
          <Heart aria-hidden="true" />
        </button>
      )}
      <Dialog.Close
        aria-label={`Fechar detalhes de ${product.name}`}
        className="storefront-product-modal-close"
      >
        <X aria-hidden="true" />
      </Dialog.Close>
    </div>
  );

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal container={portalContainer}>
        <Dialog.Overlay className="storefront-product-modal-overlay" />
        <Dialog.Content className="storefront-product-modal">
          {hasProductImage && (
            <div className="storefront-product-modal-media">
              <ProductImage
                name={product.name}
                imageUrl={product.imageUrl}
                imageAssetId={product.imageAssetId}
                sizes="(max-width: 639px) 100vw, 32rem"
                width={768}
              />
              {modalActions}
            </div>
          )}

          <div className={`storefront-product-modal-header ${hasProductImage ? 'has-media' : ''}`}>
            <div className="storefront-product-modal-heading">
              <Dialog.Title className="storefront-product-modal-title">{product.name}</Dialog.Title>
              {product.description ? (
                <Dialog.Description className="storefront-product-modal-description">
                  {product.description}
                </Dialog.Description>
              ) : (
                <Dialog.Description className="sr-only">
                  Configure as opções e a quantidade antes de adicionar o produto à sacola.
                </Dialog.Description>
              )}
              <p className="storefront-product-modal-price">
                <span>A partir de</span>
                {formatCurrency(product.basePrice)}
              </p>
            </div>
            {!hasProductImage && modalActions}
          </div>

          {product.optionGroups.length > 0 && (
            <div className="storefront-product-modal-options">
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
            <div className="storefront-product-modal-notes">
              <label htmlFor="product-notes">Alguma observação?</label>
              <Textarea
                id="product-notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Ex: Sem cebola, molho à parte..."
                rows={2}
                className="storefront-product-modal-textarea"
              />
            </div>
          )}

          <div className="storefront-product-modal-footer">
            {!storeOpen && (
              <p
                id="store-closed-product-message"
                role="status"
                className="storefront-product-modal-message"
              >
                A loja está fechada agora. Consulte o produto e volte quando os pedidos reabrirem.
              </p>
            )}
            {storeOpen && missingRequired && (
              <p
                id="required-options-message"
                role="status"
                className="storefront-product-modal-message"
              >
                Selecione os complementos obrigatórios para continuar.
              </p>
            )}
            {quantity >= MAX_CART_ITEM_QUANTITY && (
              <p
                id="product-quantity-limit"
                role="status"
                className="storefront-product-modal-message"
              >
                Limite de {MAX_CART_ITEM_QUANTITY} unidades por item atingido.
              </p>
            )}
            <div className="storefront-product-modal-purchase">
              <div className="storefront-product-quantity" aria-label="Quantidade do produto">
                <button
                  type="button"
                  aria-label="Diminuir quantidade"
                  onClick={() => setQuantity((current) => Math.max(1, current - 1))}
                  disabled={quantity <= 1}
                >
                  <Minus aria-hidden="true" />
                </button>
                <output aria-live="polite">{quantity}</output>
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
                >
                  <Plus aria-hidden="true" />
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
                className="storefront-primary-action storefront-product-modal-cta"
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

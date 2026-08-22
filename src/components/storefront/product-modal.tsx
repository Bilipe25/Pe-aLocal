'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { Heart, Minus, Plus, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { ProductImage } from '@/components/storefront/product-image';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useFavoriteFeedback } from '@/hooks/use-favorite-feedback';
import { formatCurrency } from '@/lib/utils';
import {
  MAX_CART_ITEM_QUANTITY,
  useCartStore,
  type CartItem,
  type SelectedOption,
} from '@/stores/cart-store';
import type {
  PublicStorefrontProductDetailDto,
  PublicStorefrontProductSummaryDto,
} from '@/types/storefront';

import { OptionGroupSelector } from './option-group-selector';

interface ProductModalProps {
  product: PublicStorefrontProductSummaryDto;
  detail: PublicStorefrontProductDetailDto | null;
  detailStatus: 'loading' | 'success' | 'error';
  detailError?: string;
  onRetry: () => void;
  onClose: () => void;
  onAdded?: (productId: string) => void;
  storeOpen: boolean;
  isFavorite?: boolean;
  onFavoriteToggle?: () => void;
  cartItem?: CartItem;
  promotionalPrice?: number | null;
}

export function ProductModal({
  product,
  detail,
  detailStatus,
  detailError,
  onRetry,
  onClose,
  onAdded,
  storeOpen,
  isFavorite = false,
  onFavoriteToggle,
  cartItem,
  promotionalPrice,
}: ProductModalProps) {
  const addItem = useCartStore((state) => state.addItem);
  const updateItem = useCartStore((state) => state.updateItem);
  const removeQuantity = useCartStore((state) => state.removeQuantity);
  const [quantity, setQuantity] = useState(cartItem?.quantity ?? 1);
  const [notes, setNotes] = useState(cartItem?.notes ?? '');
  const [selectedOptions, setSelectedOptions] = useState<Map<string, SelectedOption[]>>(new Map());
  const restoredCartOptionsRef = useRef(false);
  const resolvedProduct = detail ?? product;
  const optionGroups = detail?.optionGroups ?? [];
  const detailsReady = detailStatus === 'success' && detail !== null;
  const productUnavailable = Boolean(detail?.isSoldOut);

  useEffect(() => {
    if (!cartItem || !detail || restoredCartOptionsRef.current) return;
    const selectedIds = new Set(cartItem.selectedOptions.map((option) => option.id));
    const restored = new Map<string, SelectedOption[]>();
    for (const group of detail.optionGroups) {
      const options = group.options.filter((option) => selectedIds.has(option.id));
      if (options.length > 0) restored.set(group.id, options);
    }
    restoredCartOptionsRef.current = true;
    setSelectedOptions(restored);
  }, [cartItem, detail]);

  const handleOptionChange = useCallback((groupId: string, options: SelectedOption[]) => {
    setSelectedOptions((previous) => {
      const next = new Map(previous);
      next.set(groupId, options);
      return next;
    });
  }, []);

  const allSelectedOptions = Array.from(selectedOptions.values()).flat();
  const optionsPrice = allSelectedOptions.reduce((sum, option) => sum + option.price, 0);
  const effectiveBasePrice = promotionalPrice ?? resolvedProduct.basePrice;
  const unitPrice = effectiveBasePrice + optionsPrice;
  const totalPrice = unitPrice * quantity;
  const hasProductImage = Boolean(resolvedProduct.imageAssetId || resolvedProduct.imageUrl);
  const favoriteFeedback = useFavoriteFeedback(isFavorite);

  const missingRequired = optionGroups
    .filter((group) => group.isRequired)
    .some((group) => (selectedOptions.get(group.id) ?? []).length < group.minSelections);
  const portalContainer =
    typeof document === 'undefined'
      ? undefined
      : (document.querySelector<HTMLElement>('.storefront-theme') ?? undefined);

  function handleAdd() {
    if (!detailsReady || productUnavailable) {
      return;
    }

    const nextItem = {
      productId: resolvedProduct.id,
      productName: resolvedProduct.name,
      basePrice: resolvedProduct.basePrice,
      quantity,
      notes: detail?.allowNotes ? notes : '',
      selectedOptions: allSelectedOptions,
      unitPrice,
      imageUrl: resolvedProduct.imageUrl,
      imageAssetId: resolvedProduct.imageAssetId,
      imageAlt: resolvedProduct.name,
    };

    if (cartItem) {
      const updateResult = updateItem(cartItem.id, nextItem);
      if (updateResult.status === 'not-found') {
        toast.error('Este item não está mais na sacola', {
          description: 'A sacola pode ter sido atualizada em outra aba.',
        });
        onClose();
        return;
      }
      if (updateResult.status === 'quantity-limit') {
        toast.error('Limite de 99 unidades atingido', {
          description: 'Reduza a quantidade da configuração equivalente antes de salvar.',
        });
        return;
      }
      toast.success(updateResult.merged ? 'Itens equivalentes agrupados' : 'Item atualizado', {
        description: `${quantity} ${
          quantity === 1 ? 'unidade configurada' : 'unidades configuradas'
        } de ${resolvedProduct.name}.`,
      });
      onClose();
      return;
    }

    const result = addItem(nextItem);
    if (result.quantityAdded === 0) {
      toast.error('Limite de 99 unidades atingido', {
        description: 'Reduza a quantidade na sacola antes de adicionar mais deste item.',
      });
      return;
    }
    toast.success('Adicionado à sacola', {
      description: `${result.quantityAdded} ${
        result.quantityAdded === 1 ? 'unidade' : 'unidades'
      } de ${resolvedProduct.name}.`,
      action: {
        label: 'Desfazer',
        onClick: () => removeQuantity(result.itemId, result.quantityAdded),
      },
      duration: 6000,
    });
    onAdded?.(resolvedProduct.id);
    onClose();
  }

  const modalActions = (
    <div className="storefront-product-modal-actions">
      {onFavoriteToggle && (
        <button
          type="button"
          onClick={() => {
            favoriteFeedback.trigger();
            onFavoriteToggle();
          }}
          aria-label={
            isFavorite
              ? `Remover ${resolvedProduct.name} dos favoritos`
              : `Favoritar ${resolvedProduct.name}`
          }
          aria-pressed={isFavorite}
          data-favorite={isFavorite ? 'true' : 'false'}
          className={`storefront-product-modal-favorite ${isFavorite ? 'is-active' : ''} ${favoriteFeedback.isPulsing ? 'is-pulsing' : ''}`}
        >
          <Heart aria-hidden="true" />
          <span className="sr-only">{isFavorite ? 'Favorito' : 'Favoritar'}</span>
        </button>
      )}
      <Dialog.Close
        aria-label={`Fechar detalhes de ${resolvedProduct.name}`}
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
                name={resolvedProduct.name}
                imageUrl={resolvedProduct.imageUrl}
                imageAssetId={resolvedProduct.imageAssetId}
                sizes="(max-width: 639px) 100vw, 32rem"
                width={768}
              />
              {modalActions}
            </div>
          )}

          <div className={`storefront-product-modal-header ${hasProductImage ? 'has-media' : ''}`}>
            <div className="storefront-product-modal-heading">
              <Dialog.Title className="storefront-product-modal-title">
                {resolvedProduct.name}
              </Dialog.Title>
              {resolvedProduct.description ? (
                <Dialog.Description className="storefront-product-modal-description">
                  {resolvedProduct.description}
                </Dialog.Description>
              ) : (
                <Dialog.Description className="sr-only">
                  {cartItem
                    ? 'Revise as opções, a observação e a quantidade deste item.'
                    : 'Configure as opções e a quantidade antes de adicionar o produto à sacola.'}
                </Dialog.Description>
              )}
              <p className="storefront-product-modal-price">
                <span>{promotionalPrice != null ? 'Preço promocional' : 'A partir de'}</span>
                {promotionalPrice != null ? (
                  <>
                    <s className="text-text-muted mr-2 text-sm">
                      <span className="sr-only">Preço anterior: </span>
                      {formatCurrency(resolvedProduct.basePrice)}
                    </s>
                    {formatCurrency(promotionalPrice)}
                  </>
                ) : (
                  formatCurrency(resolvedProduct.basePrice)
                )}
              </p>
            </div>
            {!hasProductImage && modalActions}
          </div>

          {detailStatus === 'loading' && (
            <div
              id="product-details-loading"
              className="storefront-product-modal-load-state"
              role="status"
              aria-live="polite"
            >
              <span className="sr-only">Carregando adicionais e opções do produto.</span>
              <span className="storefront-product-modal-skeleton-line is-wide" aria-hidden="true" />
              <span className="storefront-product-modal-skeleton-line" aria-hidden="true" />
              <span className="storefront-product-modal-skeleton-option" aria-hidden="true" />
              <span className="storefront-product-modal-skeleton-option" aria-hidden="true" />
            </div>
          )}

          {detailStatus === 'error' && (
            <div
              id="product-details-error"
              className="storefront-product-modal-load-error"
              role="alert"
            >
              <p>
                {detailError ??
                  'Não foi possível carregar os adicionais deste produto. Tente novamente.'}
              </p>
              <Button type="button" variant="outline" onClick={onRetry}>
                Tentar novamente
              </Button>
            </div>
          )}

          {detailsReady && optionGroups.length > 0 && (
            <div className="storefront-product-modal-options">
              {optionGroups.map((group) => (
                <OptionGroupSelector
                  key={group.id}
                  group={group}
                  selected={selectedOptions.get(group.id) ?? []}
                  onChange={(options) => handleOptionChange(group.id, options)}
                />
              ))}
            </div>
          )}

          {detailsReady && detail?.allowNotes && (
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
            {storeOpen && detailsReady && productUnavailable && (
              <p
                id="product-sold-out-message"
                role="status"
                className="storefront-product-modal-message"
              >
                Este produto está esgotado no momento.
              </p>
            )}
            {storeOpen && detailsReady && !productUnavailable && missingRequired && (
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
                disabled={!storeOpen || !detailsReady || productUnavailable || missingRequired}
                aria-describedby={
                  !storeOpen
                    ? 'store-closed-product-message'
                    : detailStatus === 'loading'
                      ? 'product-details-loading'
                      : detailStatus === 'error'
                        ? 'product-details-error'
                        : productUnavailable
                          ? 'product-sold-out-message'
                          : missingRequired
                            ? 'required-options-message'
                            : undefined
                }
                className="storefront-primary-action storefront-product-modal-cta"
              >
                {!storeOpen
                  ? 'Loja fechada'
                  : detailStatus === 'loading'
                    ? 'Carregando...'
                    : detailStatus === 'error'
                      ? 'Detalhes indisponíveis'
                      : productUnavailable
                        ? 'Produto esgotado'
                        : cartItem
                          ? `Salvar alterações · ${formatCurrency(totalPrice)}`
                          : `Adicionar · ${formatCurrency(totalPrice)}`}
              </Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

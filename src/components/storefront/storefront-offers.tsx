'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { Minus, Plus, X } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { OptionGroupSelector } from '@/components/storefront/option-group-selector';
import { ProductImage } from '@/components/storefront/product-image';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { formatCurrency } from '@/lib/utils';
import {
  minimumRequiredOptionsPrice,
  hasIncompleteOptions,
  offerMatchesSearch,
  offerStartingPrice,
} from '@/features/storefront/offer-presentation';
import {
  MAX_CART_ITEM_QUANTITY,
  useCartStore,
  type CartComboComponent,
  type CartItem,
  type SelectedOption,
} from '@/stores/cart-store';
import type {
  PublicStorefrontOfferDto,
  PublicStorefrontProductSummaryDto,
} from '@/types/storefront';

export function StorefrontOffers({
  offers,
  storeOpen,
  onProductClick,
  showImages = true,
  search = '',
}: {
  offers: PublicStorefrontOfferDto[];
  storeOpen: boolean;
  showImages?: boolean;
  search?: string;
  onProductClick: (product: PublicStorefrontProductSummaryDto, promotionalPrice?: number) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  function restoreOfferFocus() {
    requestAnimationFrame(() => triggerRef.current?.focus());
  }
  const [selectedCombo, setSelectedCombo] = useState<Extract<
    PublicStorefrontOfferDto,
    { kind: 'COMBO' }
  > | null>(null);
  const [selectedFlexibleCombo, setSelectedFlexibleCombo] = useState<Extract<
    PublicStorefrontOfferDto,
    { kind: 'FLEXIBLE_COMBO' }
  > | null>(null);
  const matchingOffers = offers.filter((offer) => offerMatchesSearch(offer, search));
  const visibleOffers = showAll || search.trim() ? matchingOffers : matchingOffers.slice(0, 6);
  if (matchingOffers.length === 0) return null;
  return (
    <>
      <section
        id="ofertas"
        className="storefront-category-section storefront-offers-section"
        aria-labelledby="storefront-offers-title"
      >
        <div className="storefront-category-header">
          <div>
            <h2 id="storefront-offers-title" className="storefront-section-title">
              Ofertas
            </h2>
            <p className="storefront-offers-intro">
              Escolha sua oferta e personalize os adicionais.
            </p>
          </div>
          {matchingOffers.length > 6 && !search.trim() && (
            <button
              type="button"
              className="storefront-offers-toggle"
              aria-expanded={showAll}
              aria-controls="storefront-offers-list"
              onClick={() => setShowAll((current) => !current)}
            >
              {showAll ? 'Ver destaques' : `Ver todas (${matchingOffers.length})`}
            </button>
          )}
        </div>
        <ul
          id="storefront-offers-list"
          className={
            showAll || search.trim()
              ? 'storefront-offers-track is-expanded'
              : 'storefront-offers-track'
          }
        >
          {visibleOffers.map((offer) => {
            const product = offer.kind === 'PRODUCT_PROMOTION' ? offer.product : null;
            const comboOffer = offer.kind === 'PRODUCT_PROMOTION' ? null : offer;
            const name = offer.kind === 'PRODUCT_PROMOTION' ? offer.product.name : offer.name;
            const imageUrl =
              offer.kind === 'PRODUCT_PROMOTION' ? offer.product.imageUrl : offer.imageUrl;
            const imageAssetId =
              offer.kind === 'PRODUCT_PROMOTION' ? offer.product.imageAssetId : offer.imageAssetId;
            const description =
              comboOffer?.description ||
              (offer.kind === 'COMBO'
                ? offer.components
                    .map((component) => `${component.quantity}× ${component.product.name}`)
                    .join(' · ')
                : offer.kind === 'FLEXIBLE_COMBO'
                  ? offer.groups.map((group) => `${group.quantity}× ${group.name}`).join(' · ')
                  : product!.description);
            const startingPrice = offerStartingPrice(offer);
            const variablePrice =
              offer.kind === 'FLEXIBLE_COMBO' || startingPrice > offer.offerPrice;
            return (
              <li key={`${offer.kind}-${offer.id}`}>
                <button
                  type="button"
                  onClick={(event) => {
                    triggerRef.current = event.currentTarget;
                    if (offer.kind === 'COMBO') setSelectedCombo(offer);
                    else if (offer.kind === 'FLEXIBLE_COMBO') setSelectedFlexibleCombo(offer);
                    else onProductClick(offer.product, offer.offerPrice);
                  }}
                  className="storefront-offer-card"
                >
                  {showImages && (
                    <div className="storefront-offer-media">
                      <ProductImage
                        name={name}
                        imageUrl={imageUrl}
                        imageAssetId={imageAssetId}
                        width={384}
                        sizes="(max-width: 639px) 76vw, 280px"
                      />
                    </div>
                  )}
                  <div className="storefront-offer-copy">
                    {offer.savings > 0 && !variablePrice && (
                      <span className="storefront-offer-saving">
                        Economize {formatCurrency(offer.savings)}
                      </span>
                    )}
                    <h3 className="storefront-offer-name">{name}</h3>
                    <p className="storefront-offer-description">{description}</p>
                    <p className="storefront-offer-prices">
                      {!variablePrice && offer.regularPrice > startingPrice && (
                        <span className="storefront-price-previous">
                          <span className="sr-only">Preço anterior: </span>
                          {formatCurrency(offer.regularPrice)}
                        </span>
                      )}
                      <strong>
                        {variablePrice && (
                          <span className="storefront-offer-from">A partir de </span>
                        )}
                        <span className="sr-only">Preço da oferta: </span>
                        {formatCurrency(startingPrice)}
                      </strong>
                    </p>
                    <span className="storefront-offer-action">
                      {offer.kind === 'PRODUCT_PROMOTION'
                        ? 'Ver produto'
                        : offer.kind === 'FLEXIBLE_COMBO'
                          ? 'Montar combo'
                          : 'Escolher opções'}
                    </span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </section>
      {selectedCombo && (
        <ComboConfigurator
          offer={selectedCombo}
          storeOpen={storeOpen}
          onClose={() => {
            setSelectedCombo(null);
            restoreOfferFocus();
          }}
        />
      )}
      {selectedFlexibleCombo && (
        <FlexibleComboConfigurator
          offer={selectedFlexibleCombo}
          storeOpen={storeOpen}
          onClose={() => {
            setSelectedFlexibleCombo(null);
            restoreOfferFocus();
          }}
        />
      )}
    </>
  );
}

export function FlexibleComboConfigurator({
  offer,
  storeOpen,
  onClose,
  cartItem,
}: {
  offer: Extract<PublicStorefrontOfferDto, { kind: 'FLEXIBLE_COMBO' }>;
  storeOpen: boolean;
  onClose: () => void;
  cartItem?: CartItem;
}) {
  const addItem = useCartStore((state) => state.addItem);
  const updateItem = useCartStore((state) => state.updateItem);
  const removeQuantity = useCartStore((state) => state.removeQuantity);
  const [quantity, setQuantity] = useState(cartItem?.quantity ?? 1);
  const [choiceByGroup, setChoiceByGroup] = useState<Map<string, string>>(
    () =>
      new Map(
        offer.groups.map((group) => {
          const existing = group.choices.find((choice) =>
            cartItem?.comboComponents?.some(
              (component) => component.comboItemId === choice.choiceId,
            ),
          );
          const cheapest = [...group.choices].sort(
            (left, right) =>
              left.priceDelta +
              minimumRequiredOptionsPrice(left.product) -
              right.priceDelta -
              minimumRequiredOptionsPrice(right.product),
          )[0]!;
          return [group.groupId, existing?.choiceId ?? cheapest.choiceId];
        }),
      ),
  );
  const [selected, setSelected] = useState<Map<string, Map<string, SelectedOption[]>>>(() => {
    const selections = new Map<string, Map<string, SelectedOption[]>>();
    for (const group of offer.groups) {
      for (const choice of group.choices) {
        const cartComponent = cartItem?.comboComponents?.find(
          (component) => component.comboItemId === choice.choiceId,
        );
        if (!cartComponent) continue;
        selections.set(
          choice.choiceId,
          new Map(
            choice.product.optionGroups.map((optionGroup) => [
              optionGroup.id,
              cartComponent.selectedOptions.filter((option) =>
                optionGroup.options.some((candidate) => candidate.id === option.id),
              ),
            ]),
          ),
        );
      }
    }
    return selections;
  });
  const [notes, setNotes] = useState<Map<string, string>>(
    () =>
      new Map(
        cartItem?.comboComponents?.map((component) => [component.comboItemId, component.notes]) ??
          [],
      ),
  );
  const chosen = offer.groups.map((group) => ({
    group,
    choice: group.choices.find((choice) => choice.choiceId === choiceByGroup.get(group.groupId))!,
  }));
  const componentOptions = useMemo<CartComboComponent[]>(
    () =>
      chosen.map(({ group, choice }) => ({
        comboItemId: choice.choiceId,
        productId: choice.product.id,
        productName: choice.product.name,
        quantity: group.quantity,
        notes: choice.product.allowNotes ? (notes.get(choice.choiceId) ?? '') : '',
        selectedOptions: [...(selected.get(choice.choiceId)?.values() ?? [])].flat(),
      })),
    [chosen, notes, selected],
  );
  const choicesDelta = chosen.reduce(
    (total, { group, choice }) => total + choice.priceDelta * group.quantity,
    0,
  );
  const optionsPrice = componentOptions.reduce(
    (total, component) =>
      total +
      component.selectedOptions.reduce((sum, option) => sum + option.price, 0) * component.quantity,
    0,
  );
  const selectedRegularPrice = chosen.reduce(
    (total, { group, choice }) => total + choice.product.basePrice * group.quantity,
    0,
  );
  const unitPrice = offer.offerPrice + choicesDelta + optionsPrice;
  const missingRequired = chosen.some(({ choice }) =>
    hasIncompleteOptions(choice.product, selected.get(choice.choiceId)),
  );
  const portalContainer =
    typeof document === 'undefined'
      ? undefined
      : (document.querySelector<HTMLElement>('.storefront-theme') ?? undefined);

  function updateOptions(choiceId: string, groupId: string, options: SelectedOption[]) {
    setSelected((current) => {
      const next = new Map(current);
      const groups = new Map(next.get(choiceId) ?? []);
      groups.set(groupId, options);
      next.set(choiceId, groups);
      return next;
    });
  }

  function saveCombo() {
    if (!storeOpen || missingRequired) return;
    const nextItem = {
      kind: 'COMBO',
      comboId: offer.id,
      comboComponents: componentOptions,
      productId: offer.id,
      productName: offer.name,
      basePrice: selectedRegularPrice,
      quantity,
      notes: '',
      selectedOptions: componentOptions.flatMap((component) => component.selectedOptions),
      unitPrice,
      imageUrl: offer.imageUrl,
      imageAssetId: offer.imageAssetId,
      imageAlt: offer.name,
    } as const;
    if (cartItem) {
      const result = updateItem(cartItem.id, nextItem);
      if (result.status === 'quantity-limit')
        return toast.error('A alteração ultrapassa o limite de 99 combos iguais.');
      if (result.status === 'not-found') {
        toast.error('Este combo não está mais na sacola.');
        onClose();
        return;
      }
      toast.success('Combo atualizado na sacola.');
      onClose();
      return;
    }
    const result = addItem(nextItem);
    if (result.quantityAdded === 0) return toast.error('Limite de 99 combos atingido.');
    toast.success('Combo adicionado à sacola', {
      description: `${result.quantityAdded} ${result.quantityAdded === 1 ? 'unidade' : 'unidades'} de ${offer.name}.`,
      action: {
        label: 'Desfazer',
        onClick: () => removeQuantity(result.itemId, result.quantityAdded),
      },
    });
    onClose();
  }

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal container={portalContainer}>
        <Dialog.Overlay className="storefront-product-modal-overlay" />
        <Dialog.Content className="storefront-product-modal storefront-combo-modal">
          <div className="storefront-product-modal-actions">
            <Dialog.Close
              aria-label={`Fechar configuração de ${offer.name}`}
              className="storefront-product-modal-close"
            >
              <X aria-hidden="true" />
            </Dialog.Close>
          </div>
          <div className="storefront-product-modal-scroll">
            <div className="storefront-product-modal-header">
              <div className="storefront-product-modal-heading">
                <Dialog.Title className="storefront-product-modal-title">{offer.name}</Dialog.Title>
                <Dialog.Description className="storefront-product-modal-description">
                  Faça uma escolha em cada etapa. Adicionais aparecem no preço antes de incluir na
                  sacola.
                </Dialog.Description>
                <p className="text-tinta mt-3 text-xl font-bold">
                  A partir de {formatCurrency(offerStartingPrice(offer))}
                </p>
              </div>
            </div>
            <div className="storefront-product-modal-options space-y-7">
              {chosen.map(({ group, choice }, groupIndex) => (
                <section key={group.groupId} className="storefront-combo-component">
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="text-tinta font-bold">{group.name}</h3>
                    <span className="text-text-muted text-sm">
                      Etapa {groupIndex + 1} de {offer.groups.length}
                    </span>
                  </div>
                  <div className="mt-3 grid gap-2" role="radiogroup" aria-label={group.name}>
                    {group.choices.map((candidate) => (
                      <label key={candidate.choiceId} className="storefront-combo-choice">
                        <input
                          type="radio"
                          name={`flexible-group-${group.groupId}`}
                          value={candidate.choiceId}
                          checked={choice.choiceId === candidate.choiceId}
                          onChange={() =>
                            setChoiceByGroup((current) =>
                              new Map(current).set(group.groupId, candidate.choiceId),
                            )
                          }
                          className="h-4 w-4"
                        />
                        <span className="text-tinta min-w-0 flex-1 text-base font-medium break-words">
                          {candidate.product.name}
                        </span>
                        {candidate.priceDelta > 0 && (
                          <span className="text-text-muted text-sm">
                            + {formatCurrency(candidate.priceDelta * group.quantity)}
                          </span>
                        )}
                      </label>
                    ))}
                  </div>
                  {choice.product.optionGroups.map((optionGroup) => (
                    <OptionGroupSelector
                      key={optionGroup.id}
                      group={optionGroup}
                      selected={selected.get(choice.choiceId)?.get(optionGroup.id) ?? []}
                      onChange={(options) =>
                        updateOptions(choice.choiceId, optionGroup.id, options)
                      }
                    />
                  ))}
                  {choice.product.allowNotes && (
                    <div className="storefront-product-modal-notes mt-4">
                      <label htmlFor={`flexible-note-${choice.choiceId}`}>
                        Observação para {choice.product.name}
                      </label>
                      <Textarea
                        id={`flexible-note-${choice.choiceId}`}
                        rows={2}
                        maxLength={500}
                        className="storefront-product-modal-textarea"
                        value={notes.get(choice.choiceId) ?? ''}
                        onChange={(event) =>
                          setNotes((current) =>
                            new Map(current).set(choice.choiceId, event.target.value),
                          )
                        }
                      />
                    </div>
                  )}
                </section>
              ))}
            </div>
          </div>
          <div className="storefront-product-modal-footer">
            {!storeOpen && (
              <p className="storefront-product-modal-message">A loja está fechada agora.</p>
            )}
            {missingRequired && (
              <p className="storefront-product-modal-message">
                Selecione os complementos obrigatórios para continuar.
              </p>
            )}
            <div className="storefront-product-modal-purchase">
              <div
                className="storefront-product-quantity"
                role="group"
                aria-label="Quantidade de combos"
              >
                <button
                  type="button"
                  onClick={() => setQuantity((value) => Math.max(1, value - 1))}
                  disabled={quantity <= 1}
                  aria-label="Diminuir quantidade"
                >
                  <Minus aria-hidden="true" />
                </button>
                <output aria-live="polite" aria-label="Quantidade">
                  {quantity}
                </output>
                <button
                  type="button"
                  onClick={() =>
                    setQuantity((value) => Math.min(MAX_CART_ITEM_QUANTITY, value + 1))
                  }
                  disabled={quantity >= MAX_CART_ITEM_QUANTITY}
                  aria-label="Aumentar quantidade"
                >
                  <Plus aria-hidden="true" />
                </button>
              </div>
              <Button
                type="button"
                onClick={saveCombo}
                disabled={!storeOpen || missingRequired}
                className="storefront-product-modal-cta"
              >
                {cartItem ? 'Atualizar' : 'Adicionar'} · {formatCurrency(unitPrice * quantity)}
              </Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function ComboConfigurator({
  offer,
  storeOpen,
  onClose,
  cartItem,
}: {
  offer: Extract<PublicStorefrontOfferDto, { kind: 'COMBO' }>;
  storeOpen: boolean;
  onClose: () => void;
  cartItem?: CartItem;
}) {
  const addItem = useCartStore((state) => state.addItem);
  const updateItem = useCartStore((state) => state.updateItem);
  const removeQuantity = useCartStore((state) => state.removeQuantity);
  const [quantity, setQuantity] = useState(cartItem?.quantity ?? 1);
  const [selected, setSelected] = useState<Map<string, Map<string, SelectedOption[]>>>(() => {
    const selections = new Map<string, Map<string, SelectedOption[]>>();
    for (const component of offer.components) {
      const cartComponent = cartItem?.comboComponents?.find(
        (candidate) => candidate.comboItemId === component.comboItemId,
      );
      if (!cartComponent) continue;
      selections.set(
        component.comboItemId,
        new Map(
          component.product.optionGroups.map((group) => [
            group.id,
            cartComponent.selectedOptions.filter((option) =>
              group.options.some((candidate) => candidate.id === option.id),
            ),
          ]),
        ),
      );
    }
    return selections;
  });
  const [notes, setNotes] = useState<Map<string, string>>(
    () =>
      new Map(
        cartItem?.comboComponents?.map((component) => [component.comboItemId, component.notes]) ??
          [],
      ),
  );
  const componentOptions = useMemo<CartComboComponent[]>(
    () =>
      offer.components.map((component) => ({
        comboItemId: component.comboItemId,
        productId: component.product.id,
        productName: component.product.name,
        quantity: component.quantity,
        notes: component.product.allowNotes ? (notes.get(component.comboItemId) ?? '') : '',
        selectedOptions: [...(selected.get(component.comboItemId)?.values() ?? [])].flat(),
      })),
    [notes, offer.components, selected],
  );
  const optionsPrice = componentOptions.reduce(
    (total, component) =>
      total +
      component.selectedOptions.reduce((sum, option) => sum + option.price, 0) * component.quantity,
    0,
  );
  const unitPrice = offer.offerPrice + optionsPrice;
  const missingRequired = offer.components.some((component) =>
    hasIncompleteOptions(component.product, selected.get(component.comboItemId)),
  );
  const portalContainer =
    typeof document === 'undefined'
      ? undefined
      : (document.querySelector<HTMLElement>('.storefront-theme') ?? undefined);

  function updateOptions(componentId: string, groupId: string, options: SelectedOption[]) {
    setSelected((current) => {
      const next = new Map(current);
      const groups = new Map(next.get(componentId) ?? []);
      groups.set(groupId, options);
      next.set(componentId, groups);
      return next;
    });
  }

  function addCombo() {
    if (!storeOpen || missingRequired) return;
    const nextItem = {
      kind: 'COMBO',
      comboId: offer.id,
      comboComponents: componentOptions,
      productId: offer.id,
      productName: offer.name,
      basePrice: offer.regularPrice,
      quantity,
      notes: '',
      selectedOptions: componentOptions.flatMap((component) => component.selectedOptions),
      unitPrice,
      imageUrl: offer.imageUrl,
      imageAssetId: offer.imageAssetId,
      imageAlt: offer.name,
    } as const;
    if (cartItem) {
      const result = updateItem(cartItem.id, nextItem);
      if (result.status === 'quantity-limit') {
        toast.error('A alteração ultrapassa o limite de 99 combos iguais.');
        return;
      }
      if (result.status === 'not-found') {
        toast.error('Este combo não está mais na sacola.');
        onClose();
        return;
      }
      toast.success('Combo atualizado na sacola.');
      onClose();
      return;
    }
    const result = addItem(nextItem);
    if (result.quantityAdded === 0) return toast.error('Limite de 99 combos atingido.');
    toast.success('Combo adicionado à sacola', {
      description: `${result.quantityAdded} ${result.quantityAdded === 1 ? 'unidade' : 'unidades'} de ${offer.name}.`,
      action: {
        label: 'Desfazer',
        onClick: () => removeQuantity(result.itemId, result.quantityAdded),
      },
    });
    onClose();
  }

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal container={portalContainer}>
        <Dialog.Overlay className="storefront-product-modal-overlay" />
        <Dialog.Content className="storefront-product-modal storefront-combo-modal">
          <div className="storefront-product-modal-actions">
            <Dialog.Close
              aria-label={`Fechar configuração de ${offer.name}`}
              className="storefront-product-modal-close"
            >
              <X aria-hidden="true" />
            </Dialog.Close>
          </div>
          <div className="storefront-product-modal-scroll">
            <div className="storefront-product-modal-header">
              <div className="storefront-product-modal-heading">
                <Dialog.Title className="storefront-product-modal-title">{offer.name}</Dialog.Title>
                <Dialog.Description className="storefront-product-modal-description">
                  Configure cada produto. O preço especial não inclui adicionais.
                </Dialog.Description>
                <p className="mt-3 flex items-baseline gap-2">
                  <span className="text-text-muted line-through">
                    <span className="sr-only">Preço anterior: </span>
                    {formatCurrency(offer.regularPrice)}
                  </span>
                  <strong className="text-tinta text-xl">
                    <span className="sr-only">Preço da oferta: </span>
                    {formatCurrency(offer.offerPrice)}
                  </strong>
                </p>
              </div>
            </div>
            <div className="storefront-product-modal-options space-y-6">
              {offer.components.map((component) => (
                <section key={component.comboItemId} className="storefront-combo-component">
                  <h3 className="text-tinta font-bold">
                    {component.quantity}× {component.product.name}
                  </h3>
                  {component.product.optionGroups.map((group) => (
                    <OptionGroupSelector
                      key={group.id}
                      group={group}
                      selected={selected.get(component.comboItemId)?.get(group.id) ?? []}
                      onChange={(options) =>
                        updateOptions(component.comboItemId, group.id, options)
                      }
                    />
                  ))}
                  {component.product.allowNotes && (
                    <div className="storefront-product-modal-notes mt-4">
                      <label htmlFor={`combo-note-${component.comboItemId}`}>
                        Observação para {component.product.name}
                      </label>
                      <Textarea
                        id={`combo-note-${component.comboItemId}`}
                        rows={2}
                        maxLength={500}
                        className="storefront-product-modal-textarea"
                        value={notes.get(component.comboItemId) ?? ''}
                        onChange={(event) =>
                          setNotes((current) =>
                            new Map(current).set(component.comboItemId, event.target.value),
                          )
                        }
                      />
                    </div>
                  )}
                </section>
              ))}
            </div>
          </div>
          <div className="storefront-product-modal-footer">
            {!storeOpen && (
              <p className="storefront-product-modal-message">A loja está fechada agora.</p>
            )}
            {missingRequired && (
              <p className="storefront-product-modal-message">
                Selecione os complementos obrigatórios para continuar.
              </p>
            )}
            <div className="storefront-product-modal-purchase">
              <div
                className="storefront-product-quantity"
                role="group"
                aria-label="Quantidade de combos"
              >
                <button
                  type="button"
                  onClick={() => setQuantity((value) => Math.max(1, value - 1))}
                  disabled={quantity <= 1}
                  aria-label="Diminuir quantidade"
                >
                  <Minus aria-hidden="true" />
                </button>
                <output aria-live="polite" aria-label="Quantidade">
                  {quantity}
                </output>
                <button
                  type="button"
                  onClick={() =>
                    setQuantity((value) => Math.min(MAX_CART_ITEM_QUANTITY, value + 1))
                  }
                  disabled={quantity >= MAX_CART_ITEM_QUANTITY}
                  aria-label="Aumentar quantidade"
                >
                  <Plus aria-hidden="true" />
                </button>
              </div>
              <Button
                type="button"
                onClick={addCombo}
                disabled={!storeOpen || missingRequired}
                className="storefront-product-modal-cta"
              >
                {cartItem ? 'Atualizar' : 'Adicionar'} · {formatCurrency(unitPrice * quantity)}
              </Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

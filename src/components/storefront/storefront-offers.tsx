'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { Minus, Plus, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { OptionGroupSelector } from '@/components/storefront/option-group-selector';
import { ProductImage } from '@/components/storefront/product-image';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { formatCurrency } from '@/lib/utils';
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
}: {
  offers: PublicStorefrontOfferDto[];
  storeOpen: boolean;
  onProductClick: (product: PublicStorefrontProductSummaryDto, promotionalPrice?: number) => void;
}) {
  const [selectedCombo, setSelectedCombo] = useState<Extract<
    PublicStorefrontOfferDto,
    { kind: 'COMBO' }
  > | null>(null);
  const [selectedFlexibleCombo, setSelectedFlexibleCombo] = useState<Extract<
    PublicStorefrontOfferDto,
    { kind: 'FLEXIBLE_COMBO' }
  > | null>(null);
  if (offers.length === 0) return null;
  return (
    <>
      <section className="storefront-category-section" aria-labelledby="storefront-offers-title">
        <div className="storefront-category-header">
          <div>
            <h2 id="storefront-offers-title" className="storefront-section-title">
              Ofertas
            </h2>
            <p className="text-text-secondary mt-1 text-sm">
              Economia confirmada no fechamento do pedido.
            </p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {offers.map((offer) => {
            const product = offer.kind === 'PRODUCT_PROMOTION' ? offer.product : null;
            const comboOffer = offer.kind === 'PRODUCT_PROMOTION' ? null : offer;
            const name = product?.name ?? comboOffer!.name;
            const imageUrl = product?.imageUrl ?? comboOffer!.imageUrl;
            const imageAssetId = product?.imageAssetId ?? comboOffer!.imageAssetId;
            const description =
              offer.kind === 'COMBO'
                ? offer.components
                    .map((component) => `${component.quantity}× ${component.product.name}`)
                    .join(' · ')
                : offer.kind === 'FLEXIBLE_COMBO'
                  ? offer.groups.map((group) => `${group.quantity}× ${group.name}`).join(' · ')
                  : product!.description;
            return (
              <button
                key={`${offer.kind}-${offer.id}`}
                type="button"
                onClick={() => {
                  if (offer.kind === 'COMBO') setSelectedCombo(offer);
                  else if (offer.kind === 'FLEXIBLE_COMBO') setSelectedFlexibleCombo(offer);
                  else onProductClick(offer.product, offer.offerPrice);
                }}
                className="border-border bg-surface focus-visible:ring-brand-500 overflow-hidden rounded-xl border text-left transition-transform hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
              >
                <div className="bg-surface-secondary aspect-[16/9] overflow-hidden">
                  <ProductImage
                    name={name}
                    imageUrl={imageUrl}
                    imageAssetId={imageAssetId}
                    width={640}
                    sizes="(max-width: 639px) 100vw, 33vw"
                  />
                </div>
                <div className="p-4">
                  <span className="bg-success-light text-success inline-flex min-h-7 items-center rounded-full px-2.5 text-xs font-bold">
                    Economize {formatCurrency(offer.savings)}
                  </span>
                  <h3 className="text-text-primary mt-3 text-base font-bold">{name}</h3>
                  <p className="text-text-secondary mt-1 line-clamp-2 text-sm">{description}</p>
                  <p className="mt-3 flex items-baseline gap-2">
                    <span className="text-text-muted text-sm line-through">
                      <span className="sr-only">Preço anterior: </span>
                      {formatCurrency(offer.regularPrice)}
                    </span>
                    <strong className="text-text-primary text-lg">
                      <span className="sr-only">Preço da oferta: </span>
                      {formatCurrency(offer.offerPrice)}
                    </strong>
                  </p>
                  <span className="text-brand-700 mt-3 block text-sm font-semibold">
                    {offer.kind === 'PRODUCT_PROMOTION'
                      ? 'Ver produto'
                      : offer.kind === 'FLEXIBLE_COMBO'
                        ? 'Montar combo'
                        : 'Escolher opções'}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </section>
      {selectedCombo && (
        <ComboConfigurator
          offer={selectedCombo}
          storeOpen={storeOpen}
          onClose={() => setSelectedCombo(null)}
        />
      )}
      {selectedFlexibleCombo && (
        <FlexibleComboConfigurator
          offer={selectedFlexibleCombo}
          storeOpen={storeOpen}
          onClose={() => setSelectedFlexibleCombo(null)}
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
          return [group.groupId, existing?.choiceId ?? group.choices[0]!.choiceId];
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
    choice.product.optionGroups
      .filter((group) => group.isRequired)
      .some(
        (group) =>
          (selected.get(choice.choiceId)?.get(group.id) ?? []).length < group.minSelections,
      ),
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
        <Dialog.Content className="storefront-product-modal">
          <div className="storefront-product-modal-header">
            <div className="storefront-product-modal-heading">
              <Dialog.Title className="storefront-product-modal-title">{offer.name}</Dialog.Title>
              <Dialog.Description className="storefront-product-modal-description">
                Faça uma escolha em cada etapa. Adicionais aparecem no preço antes de incluir na
                sacola.
              </Dialog.Description>
              <p className="text-text-primary mt-3 text-xl font-bold">
                A partir de {formatCurrency(offer.offerPrice)}
              </p>
            </div>
            <Dialog.Close
              aria-label={`Fechar configuração de ${offer.name}`}
              className="storefront-product-modal-close"
            >
              <X aria-hidden="true" />
            </Dialog.Close>
          </div>
          <div className="storefront-product-modal-options space-y-7">
            {chosen.map(({ group, choice }, groupIndex) => (
              <section key={group.groupId} className="border-border border-b pb-7 last:border-b-0">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-text-primary font-bold">{group.name}</h3>
                  <span className="text-text-secondary text-xs">
                    Etapa {groupIndex + 1} de {offer.groups.length}
                  </span>
                </div>
                <div className="mt-3 grid gap-2">
                  {group.choices.map((candidate) => (
                    <label
                      key={candidate.choiceId}
                      className="border-border has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50 flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border p-3"
                    >
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
                      <span className="text-text-primary flex-1 text-sm font-medium">
                        {candidate.product.name}
                      </span>
                      {candidate.priceDelta > 0 && (
                        <span className="text-text-secondary text-sm">
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
                    onChange={(options) => updateOptions(choice.choiceId, optionGroup.id, options)}
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
          <div className="storefront-product-modal-footer">
            {!storeOpen && (
              <p className="storefront-product-modal-message">A loja está fechada agora.</p>
            )}
            {missingRequired && (
              <p className="storefront-product-modal-message">
                Selecione os complementos obrigatórios para continuar.
              </p>
            )}
            <div className="storefront-product-modal-purchase-row">
              <div className="storefront-product-modal-quantity" aria-label="Quantidade de combos">
                <button
                  type="button"
                  onClick={() => setQuantity((value) => Math.max(1, value - 1))}
                  disabled={quantity <= 1}
                  aria-label="Diminuir quantidade"
                >
                  <Minus aria-hidden="true" />
                </button>
                <span>{quantity}</span>
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
                className="storefront-product-modal-add"
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
    component.product.optionGroups
      .filter((group) => group.isRequired)
      .some(
        (group) =>
          (selected.get(component.comboItemId)?.get(group.id) ?? []).length < group.minSelections,
      ),
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
        <Dialog.Content className="storefront-product-modal">
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
                <strong className="text-text-primary text-xl">
                  <span className="sr-only">Preço da oferta: </span>
                  {formatCurrency(offer.offerPrice)}
                </strong>
              </p>
            </div>
            <Dialog.Close
              aria-label={`Fechar configuração de ${offer.name}`}
              className="storefront-product-modal-close"
            >
              <X aria-hidden="true" />
            </Dialog.Close>
          </div>
          <div className="storefront-product-modal-options space-y-6">
            {offer.components.map((component) => (
              <section
                key={component.comboItemId}
                className="border-border border-b pb-6 last:border-b-0"
              >
                <h3 className="text-text-primary font-bold">
                  {component.quantity}× {component.product.name}
                </h3>
                {component.product.optionGroups.map((group) => (
                  <OptionGroupSelector
                    key={group.id}
                    group={group}
                    selected={selected.get(component.comboItemId)?.get(group.id) ?? []}
                    onChange={(options) => updateOptions(component.comboItemId, group.id, options)}
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
          <div className="storefront-product-modal-footer">
            {!storeOpen && (
              <p className="storefront-product-modal-message">A loja está fechada agora.</p>
            )}
            {missingRequired && (
              <p className="storefront-product-modal-message">
                Selecione os complementos obrigatórios para continuar.
              </p>
            )}
            <div className="storefront-product-modal-purchase-row">
              <div className="storefront-product-modal-quantity" aria-label="Quantidade de combos">
                <button
                  type="button"
                  onClick={() => setQuantity((value) => Math.max(1, value - 1))}
                  disabled={quantity <= 1}
                  aria-label="Diminuir quantidade"
                >
                  <Minus aria-hidden="true" />
                </button>
                <span>{quantity}</span>
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
                className="storefront-product-modal-add"
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

import type {
  PublicStorefrontOfferDto,
  PublicStorefrontProductDetailDto,
} from '@/types/storefront';

/** Presentation only. Checkout remains authoritative for eligibility and totals. */
export function minimumRequiredOptionsPrice(product: PublicStorefrontProductDetailDto) {
  return product.optionGroups.reduce((total, group) => {
    const minimum = group.isRequired ? Math.max(1, group.minSelections) : 0;
    return (
      total +
      [...group.options]
        .sort((left, right) => left.price - right.price)
        .slice(0, minimum)
        .reduce((sum, option) => sum + option.price, 0)
    );
  }, 0);
}

export function hasIncompleteOptions(
  product: PublicStorefrontProductDetailDto,
  selections: ReadonlyMap<string, readonly unknown[]> | undefined,
) {
  return product.optionGroups.some((group) => {
    const count = selections?.get(group.id)?.length ?? 0;
    return (group.isRequired && count === 0) || (count > 0 && count < group.minSelections);
  });
}

export function offerStartingPrice(offer: PublicStorefrontOfferDto) {
  if (offer.kind === 'PRODUCT_PROMOTION') return offer.offerPrice;
  if (offer.kind === 'COMBO') {
    return (
      offer.offerPrice +
      offer.components.reduce(
        (total, component) =>
          total + minimumRequiredOptionsPrice(component.product) * component.quantity,
        0,
      )
    );
  }
  return (
    offer.offerPrice +
    offer.groups.reduce(
      (total, group) =>
        total +
        group.quantity *
          Math.min(
            ...group.choices.map(
              (choice) => choice.priceDelta + minimumRequiredOptionsPrice(choice.product),
            ),
          ),
      0,
    )
  );
}

export function productPromotionPrices(offers: readonly PublicStorefrontOfferDto[]) {
  const prices = new Map<string, number>();
  for (const offer of offers) {
    if (offer.kind !== 'PRODUCT_PROMOTION' || offer.offerPrice >= offer.product.basePrice) continue;
    prices.set(
      offer.product.id,
      Math.min(prices.get(offer.product.id) ?? Infinity, offer.offerPrice),
    );
  }
  return prices;
}

export function offerMatchesSearch(offer: PublicStorefrontOfferDto, query: string) {
  const normalize = (value: string) =>
    value
      .trim()
      .toLocaleLowerCase('pt-BR')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  const text =
    offer.kind === 'PRODUCT_PROMOTION'
      ? `${offer.product.name} ${offer.product.description ?? ''}`
      : `${offer.name} ${offer.description ?? ''} ${
          offer.kind === 'COMBO'
            ? offer.components.map((component) => component.product.name).join(' ')
            : offer.groups
                .flatMap((group) => [
                  group.name,
                  ...group.choices.map((choice) => choice.product.name),
                ])
                .join(' ')
        }`;
  return normalize(text).includes(normalize(query));
}

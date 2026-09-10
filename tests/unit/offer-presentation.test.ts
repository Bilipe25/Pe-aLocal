import { describe, expect, it } from 'vitest';
import {
  hasIncompleteOptions,
  minimumRequiredOptionsPrice,
  offerStartingPrice,
} from '@/features/storefront/offer-presentation';
import { fixedOffer, flexibleOffer, offerProduct } from '../fixtures/storefront-offers';

describe('preços de entrada das ofertas', () => {
  it('inclui escolhas obrigatórias pagas por quantidade do componente', () => {
    const product = {
      ...offerProduct,
      optionGroups: [
        {
          ...offerProduct.optionGroups[0],
          options: [
            { id: 'a', name: 'A', price: 400 },
            { id: 'b', name: 'B', price: 200 },
          ],
        },
      ],
    };
    expect(minimumRequiredOptionsPrice(product)).toBe(200);
    expect(
      offerStartingPrice({
        ...fixedOffer,
        components: [{ comboItemId: 'a', quantity: 2, product }],
      }),
    ).toBe(2400);
    expect(
      offerStartingPrice({
        ...flexibleOffer,
        groups: [
          {
            ...flexibleOffer.groups[0],
            quantity: 2,
            choices: [{ choiceId: 'a', priceDelta: 100, product }],
          },
        ],
      }),
    ).toBe(2600);
  });
  it('não cobra complementos opcionais e soma os menores preços obrigatórios', () => {
    const product = {
      ...offerProduct,
      optionGroups: [{ ...offerProduct.optionGroups[1], isRequired: true, minSelections: 2 }],
    };
    expect(minimumRequiredOptionsPrice(product)).toBe(500);
    expect(
      minimumRequiredOptionsPrice({
        ...product,
        optionGroups: [{ ...product.optionGroups[0], isRequired: false }],
      }),
    ).toBe(0);
  });
  it('bloqueia obrigatório sem seleção mesmo quando o mínimo cadastrado é zero', () => {
    expect(
      hasIncompleteOptions(
        { ...offerProduct, optionGroups: [{ ...offerProduct.optionGroups[0], minSelections: 0 }] },
        new Map(),
      ),
    ).toBe(true);
  });
  it('exige o mínimo de um grupo opcional somente depois da primeira escolha', () => {
    const product = {
      ...offerProduct,
      optionGroups: [{ ...offerProduct.optionGroups[1], minSelections: 2 }],
    };
    expect(hasIncompleteOptions(product, new Map())).toBe(false);
    expect(hasIncompleteOptions(product, new Map([['extras', [{}]]]))).toBe(true);
    expect(hasIncompleteOptions(product, new Map([['extras', [{}, {}]]]))).toBe(false);
  });
});

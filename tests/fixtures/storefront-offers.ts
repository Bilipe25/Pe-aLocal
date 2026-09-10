import type {
  PublicStorefrontOfferDto,
  PublicStorefrontProductDetailDto,
} from '@/types/storefront';

export const offerProduct: PublicStorefrontProductDetailDto = {
  id: 'product-burger',
  name: 'X-Burguer Clássico',
  description: 'Pão, carne e queijo',
  basePrice: 2500,
  imageUrl: null,
  imageAssetId: null,
  isSoldOut: false,
  isFeatured: false,
  allowNotes: true,
  optionGroups: [
    {
      id: 'point',
      title: 'Ponto da carne',
      description: null,
      isRequired: true,
      isMultiple: false,
      minSelections: 1,
      maxSelections: 1,
      options: [
        { id: 'well', name: 'Bem passado', price: 0 },
        { id: 'medium', name: 'Ao ponto', price: 0 },
      ],
    },
    {
      id: 'extras',
      title: 'Adicionais',
      description: null,
      isRequired: false,
      isMultiple: true,
      minSelections: 0,
      maxSelections: 2,
      options: [
        { id: 'bacon', name: 'Bacon extra', price: 300 },
        { id: 'egg', name: 'Ovo extra', price: 200 },
      ],
    },
  ],
};

export const fixedOffer: Extract<PublicStorefrontOfferDto, { kind: 'COMBO' }> = {
  kind: 'COMBO',
  id: 'combo-xis',
  version: 1,
  name: 'Combo XIS',
  description: 'Seu lanche com bebida.',
  regularPrice: 2990,
  offerPrice: 2000,
  savings: 990,
  imageUrl: null,
  imageAssetId: null,
  components: [
    { comboItemId: 'burger', quantity: 1, product: offerProduct },
    {
      comboItemId: 'coke',
      quantity: 1,
      product: {
        ...offerProduct,
        id: 'coke',
        name: 'Coca-Cola 350ml',
        basePrice: 490,
        allowNotes: false,
        optionGroups: [],
      },
    },
  ],
};

export const flexibleOffer: Extract<PublicStorefrontOfferDto, { kind: 'FLEXIBLE_COMBO' }> = {
  kind: 'FLEXIBLE_COMBO',
  id: 'combo-flex',
  version: 1,
  name: 'Monte seu combo',
  description: null,
  regularPrice: 2500,
  offerPrice: 2000,
  savings: 500,
  imageUrl: null,
  imageAssetId: null,
  groups: [
    {
      groupId: 'main',
      name: 'Escolha o lanche',
      quantity: 1,
      choices: [
        {
          choiceId: 'premium',
          priceDelta: 500,
          product: { ...offerProduct, name: 'Burger especial' },
        },
        { choiceId: 'classic', priceDelta: 0, product: offerProduct },
      ],
    },
  ],
};

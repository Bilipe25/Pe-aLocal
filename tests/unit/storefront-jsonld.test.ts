import { describe, expect, it } from 'vitest';

import { createDefaultCustomization } from '@/features/customization/domain';
import { buildMenuJsonLd, serializeJsonLd } from '@/lib/storefront/jsonld';

const store = {
  name: 'Loja do Bairro',
  description: 'Comida feita na hora.',
  phone: '(85) 99999-9999',
  logoUrl: null,
  coverUrl: '/cover.jpg',
  address: {
    street: 'Rua das Flores',
    number: '123',
    complement: null,
    neighborhood: 'Centro',
    city: 'Fortaleza',
    state: 'CE',
    zipCode: '60000000',
  },
  openingHours: [{ dayOfWeek: 'MONDAY', openTime: '11:00', closeTime: '22:00' }],
  customization: {
    config: createDefaultCustomization(),
    assets: {
      logo: null,
      cover: null,
      socialImage: null,
    },
  },
};

const categories = [
  {
    id: 'category-1',
    name: 'Lanches',
    description: 'Hambúrgueres e acompanhamentos.',
    image: null,
    products: [
      {
        id: 'product-1',
        name: 'X-Bacon',
        description: 'Pão, carne e bacon.',
        imageUrl: '/api/store-assets/product-1?width=384',
        imageAssetId: 'product-1',
        basePrice: 2_500,
        isFeatured: true,
        isSoldOut: false,
      },
      {
        id: 'product-2',
        name: 'Batata',
        description: null,
        imageUrl: null,
        imageAssetId: null,
        basePrice: 1_200,
        isFeatured: false,
        isSoldOut: true,
      },
    ],
  },
];

describe('JSON-LD do cardápio público', () => {
  it('descreve restaurante, menu, seção, itens e ofertas em URLs absolutas', () => {
    const schema = buildMenuJsonLd(store, categories, 'https://loja.exemplo.com/');
    const graph = schema['@graph'] as Array<Record<string, unknown>>;
    const restaurant = graph.find((entity) => entity['@type'] === 'Restaurant');
    const menu = graph.find((entity) => entity['@type'] === 'Menu');
    const items = graph.filter((entity) => entity['@type'] === 'MenuItem');

    expect(schema['@context']).toBe('https://schema.org');
    expect(restaurant).toMatchObject({
      name: 'Loja do Bairro',
      telephone: '(85) 99999-9999',
      hasMenu: { '@id': 'https://loja.exemplo.com#menu' },
      address: {
        '@type': 'PostalAddress',
        streetAddress: 'Rua das Flores, 123',
        addressLocality: 'Centro, Fortaleza',
        addressRegion: 'CE',
      },
    });
    expect(menu).toMatchObject({
      name: 'Cardápio de Loja do Bairro',
      inLanguage: 'pt-BR',
    });
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      name: 'X-Bacon',
      url: 'https://loja.exemplo.com#product-product-1',
      offers: {
        price: '25.00',
        priceCurrency: 'BRL',
        availability: 'https://schema.org/InStock',
      },
    });
    expect(items[1]).toMatchObject({
      offers: { availability: 'https://schema.org/OutOfStock' },
    });
    expect(JSON.stringify(schema)).not.toContain('tenantId');
  });

  it('escapa caracteres que poderiam fechar a tag script', () => {
    expect(serializeJsonLd({ name: '</script><script>alert(1)</script>' })).toBe(
      '{"name":"\\u003c/script\\u003e\\u003cscript\\u003ealert(1)\\u003c/script\\u003e"}',
    );
  });
});

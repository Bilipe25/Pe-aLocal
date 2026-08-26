import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getPublicDeliveryZones: vi.fn(),
  getPublicCartStoreBySlug: vi.fn(),
  getPublicOffers: vi.fn(),
  getPublicPurchaseStoreBySlug: vi.fn(),
  getPublicStorefrontSitemapEntries: vi.fn(),
}));

vi.mock('@/server/queries/public-store', () => ({
  getPublicDeliveryZones: mocks.getPublicDeliveryZones,
  getPublicCartStoreBySlug: mocks.getPublicCartStoreBySlug,
  getPublicOffers: mocks.getPublicOffers,
  getPublicPurchaseStoreBySlug: mocks.getPublicPurchaseStoreBySlug,
  getPublicStorefrontSitemapEntries: mocks.getPublicStorefrontSitemapEntries,
}));

import { generateMetadata as generateCartMetadata } from '@/app/[storeSlug]/(tabs)/cart/page';
import { generateMetadata as generateCheckoutMetadata } from '@/app/[storeSlug]/checkout/page';
import robots from '@/app/robots';
import sitemap from '@/app/sitemap';

describe('rotas SEO públicas', () => {
  it('publica a home e somente as lojas retornadas pelo índice público', async () => {
    mocks.getPublicStorefrontSitemapEntries.mockResolvedValue([
      { slug: 'loja-1', lastModified: new Date('2026-07-23T10:00:00Z') },
    ]);

    await expect(sitemap()).resolves.toEqual([
      {
        url: 'http://localhost:3000/',
        changeFrequency: 'monthly',
        priority: 1,
      },
      {
        url: 'http://localhost:3000/loja-1',
        lastModified: new Date('2026-07-23T10:00:00Z'),
        changeFrequency: 'daily',
        priority: 0.8,
      },
    ]);
  });

  it('bloqueia rotas privadas no robots.txt e aponta para o sitemap', () => {
    const result = robots();
    const rules = Array.isArray(result.rules) ? result.rules[0] : result.rules;

    expect(rules).toMatchObject({
      userAgent: '*',
      allow: '/',
      disallow: expect.arrayContaining(['/*/cart', '/*/checkout', '/*/order/']),
    });
    expect(result.sitemap).toBe('http://localhost:3000/sitemap.xml');
  });

  it('marca carrinho e checkout como noindex, nofollow e noarchive', async () => {
    mocks.getPublicCartStoreBySlug.mockResolvedValue({ name: 'Loja 1' });
    mocks.getPublicPurchaseStoreBySlug.mockResolvedValue({ name: 'Loja 1' });

    const cartMetadata = await generateCartMetadata({
      params: Promise.resolve({ storeSlug: 'loja-1' }),
    });
    const checkoutMetadata = await generateCheckoutMetadata({
      params: Promise.resolve({ storeSlug: 'loja-1' }),
      searchParams: Promise.resolve({}),
    });

    expect(cartMetadata.robots).toMatchObject({
      index: false,
      follow: false,
      noarchive: true,
      nocache: true,
    });
    expect(checkoutMetadata.robots).toMatchObject({
      index: false,
      follow: false,
      noarchive: true,
      nocache: true,
    });
  });
});

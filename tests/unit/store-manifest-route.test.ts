import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createDefaultCustomization } from '@/features/customization/domain';

const mocks = vi.hoisted(() => ({ getPublicStorePwaBySlug: vi.fn() }));

vi.mock('@/server/queries/public-store-pwa', () => ({
  getPublicStorePwaBySlug: mocks.getPublicStorePwaBySlug,
}));

import { GET } from '@/app/[storeSlug]/manifest.webmanifest/route';

const publicStore = {
  id: 'store-1',
  name: 'Loja Um',
  slug: 'loja-um',
  requestedSlug: 'loja-um',
  description: null,
  config: createDefaultCustomization(),
  iconAssetId: null,
};

describe('manifest white-label', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getPublicStorePwaBySlug.mockResolvedValue(publicStore);
  });

  it('responde manifest JSON com Content-Type correto', async () => {
    const response = await GET(new Request('https://exemplo.test/loja-um/manifest.webmanifest'), {
      params: Promise.resolve({ storeSlug: 'loja-um' }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/manifest+json; charset=utf-8');
    expect(response.headers.get('cache-control')).toContain('s-maxage=60');
    expect(await response.json()).toMatchObject({ id: '/pwa/store/store-1' });
  });

  it('redireciona slug antigo para o manifest canônico no mesmo host', async () => {
    const response = await GET(
      new Request('https://dominio-da-loja.test/loja-antiga/manifest.webmanifest'),
      { params: Promise.resolve({ storeSlug: 'loja-antiga' }) },
    );

    expect(response.status).toBe(308);
    expect(response.headers.get('location')).toBe(
      'https://dominio-da-loja.test/loja-um/manifest.webmanifest',
    );
  });

  it('responde 404 sem dados internos', async () => {
    mocks.getPublicStorePwaBySlug.mockResolvedValue(null);
    const response = await GET(new Request('https://exemplo.test/ausente/manifest.webmanifest'), {
      params: Promise.resolve({ storeSlug: 'ausente' }),
    });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Loja não encontrada.' });
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from '@/app/api/storefront/[storeSlug]/products/[productId]/route';

const mocks = vi.hoisted(() => ({
  getPublicProductDetail: vi.fn(),
  getPublicStoreScopeBySlug: vi.fn(),
}));

vi.mock('@/server/queries/public-store', () => ({
  getPublicProductDetail: mocks.getPublicProductDetail,
  getPublicStoreScopeBySlug: mocks.getPublicStoreScopeBySlug,
}));

const storeSlug = 'burger-do-ze';
const productId = '00000000-0000-0000-0002-000000000001';
const product = {
  id: productId,
  name: 'Burger da casa',
  description: 'Pão, carne e queijo',
  imageUrl: null,
  imageAssetId: null,
  basePrice: 2_500,
  isFeatured: true,
  isSoldOut: false,
  allowNotes: true,
  optionGroups: [
    {
      id: 'group-1',
      title: 'Adicionais',
      description: null,
      isRequired: false,
      isMultiple: true,
      minSelections: 0,
      maxSelections: 3,
      options: [{ id: 'option-1', name: 'Bacon', price: 400 }],
    },
  ],
};

function request(params: { storeSlug: string; productId: string }) {
  return GET(
    new Request(
      `http://localhost/api/storefront/${encodeURIComponent(params.storeSlug)}/products/${encodeURIComponent(params.productId)}`,
    ),
    { params: Promise.resolve(params) },
  );
}

describe('GET /api/storefront/:storeSlug/products/:productId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getPublicStoreScopeBySlug.mockResolvedValue({
      id: 'store-1',
      tenantId: 'tenant-1',
      slug: storeSlug,
    });
    mocks.getPublicProductDetail.mockResolvedValue(product);
  });

  it('retorna o detalhe público escopado com cache compartilhado seguro', async () => {
    const response = await request({ storeSlug, productId });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ product });
    expect(mocks.getPublicStoreScopeBySlug).toHaveBeenCalledWith(storeSlug);
    expect(mocks.getPublicProductDetail).toHaveBeenCalledWith('store-1', 'tenant-1', productId);
    expect(response.headers.get('cache-control')).toBe(
      'public, max-age=0, s-maxage=60, stale-while-revalidate=300',
    );
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(JSON.stringify(product)).not.toContain('tenantId');
    expect(JSON.stringify(product)).not.toContain('storeId');
  });

  it.each([
    {
      label: 'slug',
      params: { storeSlug: 'Slug Inválido', productId },
    },
    {
      label: 'produto',
      params: { storeSlug, productId: 'produto-invalido' },
    },
  ])('rejeita $label inválido sem consultar a loja ou o produto', async ({ params }) => {
    const response = await request(params);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'O produto informado é inválido.',
    });
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(mocks.getPublicStoreScopeBySlug).not.toHaveBeenCalled();
    expect(mocks.getPublicProductDetail).not.toHaveBeenCalled();
  });

  it('não diferencia loja ausente de produto ausente ou fora do tenant', async () => {
    mocks.getPublicStoreScopeBySlug.mockResolvedValueOnce(null);
    const missingStoreResponse = await request({ storeSlug, productId });
    const missingStoreBody = await missingStoreResponse.json();

    mocks.getPublicStoreScopeBySlug.mockResolvedValueOnce({
      id: 'store-1',
      tenantId: 'tenant-1',
      slug: storeSlug,
    });
    mocks.getPublicProductDetail.mockResolvedValueOnce(null);
    const outOfScopeProductResponse = await request({ storeSlug, productId });
    const outOfScopeProductBody = await outOfScopeProductResponse.json();

    expect(missingStoreResponse.status).toBe(404);
    expect(outOfScopeProductResponse.status).toBe(404);
    expect(missingStoreBody).toEqual(outOfScopeProductBody);
    expect(outOfScopeProductBody).toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
      message: 'Produto não encontrado.',
    });
    expect(missingStoreResponse.headers.get('cache-control')).toContain('no-store');
    expect(outOfScopeProductResponse.headers.get('cache-control')).toContain('no-store');
    expect(mocks.getPublicProductDetail).toHaveBeenCalledTimes(1);
    expect(mocks.getPublicProductDetail).toHaveBeenCalledWith('store-1', 'tenant-1', productId);
  });
});

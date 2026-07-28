import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from '@/app/api/storefront/[storeSlug]/recommendations/route';

const mocks = vi.hoisted(() => ({
  getCandidates: vi.fn(),
  getStoreScope: vi.fn(),
  getAvailability: vi.fn(),
  rateLimitCheck: vi.fn(),
}));

vi.mock('@/server/queries/public-store', () => ({
  getPublicCartRecommendationCandidates: mocks.getCandidates,
  getPublicStoreScopeBySlug: mocks.getStoreScope,
}));
vi.mock('@/server/services/store-availability.service', () => ({
  getEffectiveStoreAvailabilityForTenant: mocks.getAvailability,
}));
vi.mock('@/server/rate-limit', () => ({
  RATE_LIMITS: { storefrontRecommendations: { maxAttempts: 60, windowInSeconds: 60 } },
  getRateLimiter: () => ({ check: mocks.rateLimitCheck }),
}));

const currentProductId = '00000000-0000-0000-0002-000000000001';

function candidate(id: string, categoryId: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    name: `Produto ${id.slice(-1)}`,
    basePrice: 1_000,
    imageUrl: null,
    imageAssetId: null,
    category: { id: categoryId, name: `Categoria ${categoryId}` },
    isAvailable: true,
    isFeatured: false,
    requiresConfiguration: false,
    categorySortOrder: 1_000,
    productSortOrder: 1_000,
    ...overrides,
  };
}

function request(payload: unknown, storeSlug = 'burger-do-ze') {
  return POST(
    new Request(`https://pedidolocal.test/api/storefront/${storeSlug}/recommendations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
    { params: Promise.resolve({ storeSlug }) },
  );
}

describe('POST /api/storefront/:storeSlug/recommendations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getStoreScope.mockResolvedValue({
      id: 'store-1',
      tenantId: 'tenant-1',
      slug: 'burger-do-ze',
    });
    mocks.getAvailability.mockResolvedValue({ acceptingOrders: true });
    mocks.rateLimitCheck.mockResolvedValue({
      allowed: true,
      remaining: 59,
      resetAt: Date.now() + 60_000,
    });
    mocks.getCandidates.mockResolvedValue([
      candidate(currentProductId, 'main'),
      candidate('00000000-0000-0000-0002-000000000002', 'drinks', { isFeatured: true }),
      candidate('00000000-0000-0000-0002-000000000003', 'main'),
    ]);
  });

  it('retorna DTO compacto, determinístico e escopado pela loja', async () => {
    const response = await request({ productIds: [currentProductId] });
    const body = (await response.json()) as {
      recommendations: { id: string }[];
    };

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store, max-age=0');
    expect(mocks.getStoreScope).toHaveBeenCalledWith('burger-do-ze');
    expect(mocks.rateLimitCheck).toHaveBeenCalledWith({
      identifier: 'recommendation:store-1:unknown',
      maxAttempts: 60,
      windowInSeconds: 60,
      strict: false,
    });
    expect(mocks.getAvailability).toHaveBeenCalledWith('tenant-1', 'store-1');
    expect(mocks.getCandidates).toHaveBeenCalledWith('store-1', 'tenant-1');
    expect(body.recommendations.map((item) => item.id)).toEqual([
      '00000000-0000-0000-0002-000000000002',
      '00000000-0000-0000-0002-000000000003',
    ]);
    expect(JSON.stringify(body)).not.toMatch(/tenantId|storeId|sortOrder|optionGroups/);
  });

  it('oculta recomendações quando a loja não aceita pedidos', async () => {
    mocks.getAvailability.mockResolvedValueOnce({ acceptingOrders: false });

    const response = await request({ productIds: [currentProductId] });

    await expect(response.json()).resolves.toEqual({ recommendations: [] });
    expect(mocks.getCandidates).not.toHaveBeenCalled();
  });

  it.each([
    ['ID inválido', { productIds: ['produto-invalido'] }],
    ['IDs duplicados', { productIds: [currentProductId, currentProductId] }],
    [
      'mais de 50 linhas',
      {
        productIds: Array.from(
          { length: 51 },
          (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
        ),
      },
    ],
    ['campo extra', { productIds: [], tenantId: 'tenant-alheio' }],
  ])('rejeita %s antes de consultar a loja', async (_label, payload) => {
    const response = await request(payload);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: 'VALIDATION_ERROR',
      message: 'Os itens do carrinho são inválidos.',
    });
    expect(mocks.getStoreScope).not.toHaveBeenCalled();
    expect(mocks.getCandidates).not.toHaveBeenCalled();
  });

  it('não diferencia uma loja inexistente e não consulta candidatos', async () => {
    mocks.getStoreScope.mockResolvedValueOnce(null);

    const response = await request({ productIds: [currentProductId] });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ code: 'NOT_FOUND' });
    expect(mocks.getCandidates).not.toHaveBeenCalled();
  });

  it('limita abuso antes de calcular disponibilidade ou consultar candidatos', async () => {
    mocks.rateLimitCheck.mockResolvedValueOnce({
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + 60_000,
    });

    const response = await request({ productIds: [currentProductId] });

    expect(response.status).toBe(429);
    expect(mocks.getAvailability).not.toHaveBeenCalled();
    expect(mocks.getCandidates).not.toHaveBeenCalled();
  });

  it('interrompe a leitura quando o corpo excede 4 KiB sem depender de Content-Length', async () => {
    const oversizedRequest = new Request(
      'https://pedidolocal.test/api/storefront/burger-do-ze/recommendations',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productIds: [], padding: 'x'.repeat(5_000) }),
      },
    );
    oversizedRequest.headers.delete('content-length');

    const response = await POST(oversizedRequest, {
      params: Promise.resolve({ storeSlug: 'burger-do-ze' }),
    });

    expect(response.status).toBe(400);
    expect(mocks.getStoreScope).not.toHaveBeenCalled();
    expect(mocks.rateLimitCheck).not.toHaveBeenCalled();
  });

  it('falha com resposta segura sem expor detalhes técnicos', async () => {
    mocks.getCandidates.mockRejectedValueOnce(new Error('database connection secret'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const response = await request({ productIds: [currentProductId] });
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      statusCode: 500,
      code: 'INTERNAL_ERROR',
      message: 'Ocorreu um erro interno. Tente novamente mais tarde.',
      details: [],
    });
    expect(JSON.stringify(body)).not.toContain('database connection secret');
  });
});

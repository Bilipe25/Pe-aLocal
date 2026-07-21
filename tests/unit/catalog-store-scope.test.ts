import { beforeEach, describe, expect, it, vi } from 'vitest';

import { updateCategoryAction } from '@/features/catalog/actions';

const mocks = vi.hoisted(() => ({
  requireActiveStoreContext: vi.fn(),
  findCategoryById: vi.fn(),
  updateCategory: vi.fn(),
}));

vi.mock('next/cache', () => ({ updateTag: vi.fn() }));
vi.mock('@/server/services/store-context.service', () => ({
  requireActiveStoreContext: mocks.requireActiveStoreContext,
}));
vi.mock('@/server/repositories/category.repository', () => ({
  findCategoryById: mocks.findCategoryById,
  updateCategory: mocks.updateCategory,
}));
vi.mock('@/server/repositories/product.repository', () => ({}));
vi.mock('@/server/repositories/option-group.repository', () => ({}));
vi.mock('@/server/database/client', () => ({ getDb: vi.fn() }));

describe('isolamento do catálogo por loja', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireActiveStoreContext.mockResolvedValue({
      session: { tenantId: 'tenant-a' },
      store: { id: 'store-a' },
    });
  });

  it('não atualiza categoria de outra loja do mesmo tenant', async () => {
    mocks.findCategoryById.mockResolvedValue({
      id: 'category-b',
      tenantId: 'tenant-a',
      storeId: 'store-b',
    });
    const formData = new FormData();
    formData.set('name', 'Categoria atualizada');

    await expect(updateCategoryAction('category-b', formData)).resolves.toMatchObject({
      success: false,
      error: { code: 'NOT_FOUND' },
    });
    expect(mocks.updateCategory).not.toHaveBeenCalled();
  });
});

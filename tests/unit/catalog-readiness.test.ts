import { describe, it, expect, vi, beforeEach } from 'vitest';
import { analyzeCatalogReadiness } from '@/server/services/catalog-readiness.service';

// Mock Prisma
vi.mock('@/server/database/client', () => ({
  getDb: vi.fn(() => mockDb),
}));

const mockDb = {
  category: { findMany: vi.fn() },
  product: { findMany: vi.fn() },
};

describe('analyzeCatalogReadiness', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retorna lista vazia quando catálogo está saudável', async () => {
    mockDb.category.findMany.mockResolvedValue([]);
    mockDb.product.findMany.mockResolvedValue([]);

    const issues = await analyzeCatalogReadiness('tenant-1', 'store-1');
    expect(issues).toHaveLength(0);
  });

  it('detecta categoria ativa sem produtos disponíveis', async () => {
    mockDb.category.findMany.mockResolvedValue([
      { id: 'cat-1', name: 'Hambúrgueres' },
    ]);
    mockDb.product.findMany.mockResolvedValue([]);

    const issues = await analyzeCatalogReadiness('tenant-1', 'store-1');
    expect(issues).toHaveLength(1);
    expect(issues[0].type).toBe('empty_category');
    expect(issues[0].entityId).toBe('cat-1');
    expect(issues[0].message).toContain('Hambúrgueres');
  });

  it('detecta produto com grupo obrigatório sem opções disponíveis', async () => {
    mockDb.category.findMany.mockResolvedValue([]);
    mockDb.product.findMany.mockResolvedValue([
      {
        id: 'prod-1',
        name: 'X-Burguer',
        optionGroups: [
          {
            id: 'group-1',
            title: 'Molho',
            _count: { options: 0 },
          },
        ],
      },
    ]);

    const issues = await analyzeCatalogReadiness('tenant-1', 'store-1');
    expect(issues).toHaveLength(1);
    expect(issues[0].type).toBe('product_no_required_group_options');
    expect(issues[0].entityId).toBe('prod-1');
    expect(issues[0].message).toContain('X-Burguer');
    expect(issues[0].message).toContain('Molho');
  });

  it('detecta múltiplos problemas simultâneos', async () => {
    mockDb.category.findMany.mockResolvedValue([
      { id: 'cat-1', name: 'Saladas' },
      { id: 'cat-2', name: 'Sobremesas' },
    ]);
    mockDb.product.findMany.mockResolvedValue([
      {
        id: 'prod-1',
        name: 'Prato A',
        optionGroups: [
          { id: 'g-1', title: 'Tamanho', _count: { options: 0 } },
        ],
      },
    ]);

    const issues = await analyzeCatalogReadiness('tenant-1', 'store-1');
    expect(issues).toHaveLength(3); // 2 empty categories + 1 product issue
  });

  it('não reporta produto com grupo que tem opções', async () => {
    mockDb.category.findMany.mockResolvedValue([]);
    mockDb.product.findMany.mockResolvedValue([
      {
        id: 'prod-1',
        name: 'X-Burguer',
        optionGroups: [
          { id: 'g-1', title: 'Molho', _count: { options: 3 } },
        ],
      },
    ]);

    const issues = await analyzeCatalogReadiness('tenant-1', 'store-1');
    expect(issues).toHaveLength(0);
  });
});

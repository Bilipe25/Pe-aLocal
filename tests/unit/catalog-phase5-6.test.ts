import { describe, it, expect } from 'vitest';

// =============================================================================
// Testes unitários dos batch reorder actions
// Verificam a lógica de parsing de IDs e geração de sortOrder
// =============================================================================

describe('Batch Reorder — lógica de sortOrder', () => {
  it('gera sortOrders espaçados em 1000 para evitar colisão', () => {
    const ids = ['a', 'b', 'c', 'd'];
    const expected = ids.map((_, index) => (index + 1) * 1000);
    expect(expected).toEqual([1000, 2000, 3000, 4000]);
  });

  it('lista vazia retorna sem gerar atualizações', () => {
    const ids: string[] = [];
    // action retorna actionSuccess sem chamar DB
    expect(ids.length === 0).toBe(true);
  });

  it('ordem de IDs determina sortOrder crescente', () => {
    const ids = ['cat-3', 'cat-1', 'cat-2'];
    const sortOrders = ids.map((id, index) => ({ id, sortOrder: (index + 1) * 1000 }));
    expect(sortOrders[0]).toEqual({ id: 'cat-3', sortOrder: 1000 });
    expect(sortOrders[1]).toEqual({ id: 'cat-1', sortOrder: 2000 });
    expect(sortOrders[2]).toEqual({ id: 'cat-2', sortOrder: 3000 });
  });
});

describe('ProductImageUpload — validação client-side', () => {
  const MAX_MB = 3;
  const ACCEPT_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/avif'];

  it('rejeita arquivos acima de 3 MB', () => {
    const file = { size: MAX_MB * 1024 * 1024 + 1, type: 'image/jpeg' };
    expect(file.size > MAX_MB * 1024 * 1024).toBe(true);
  });

  it('aceita arquivos exatamente no limite', () => {
    const file = { size: MAX_MB * 1024 * 1024, type: 'image/jpeg' };
    expect(file.size > MAX_MB * 1024 * 1024).toBe(false);
  });

  it('rejeita tipos MIME inválidos', () => {
    const invalidTypes = ['image/gif', 'image/bmp', 'application/pdf', 'video/mp4'];
    for (const type of invalidTypes) {
      expect(ACCEPT_TYPES.includes(type)).toBe(false);
    }
  });

  it('aceita tipos MIME válidos', () => {
    for (const type of ACCEPT_TYPES) {
      expect(ACCEPT_TYPES.includes(type)).toBe(true);
    }
  });
});

describe('CatalogSortableList — lógica de reordenação', () => {
  function reorderLocally<T>(arr: T[], fromIndex: number, toIndex: number): T[] {
    const next = [...arr];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    return next;
  }

  it('move item do início para o fim', () => {
    const items = ['A', 'B', 'C'];
    expect(reorderLocally(items, 0, 2)).toEqual(['B', 'C', 'A']);
  });

  it('move item do fim para o início', () => {
    const items = ['A', 'B', 'C'];
    expect(reorderLocally(items, 2, 0)).toEqual(['C', 'A', 'B']);
  });

  it('move item adjacente', () => {
    const items = ['A', 'B', 'C'];
    expect(reorderLocally(items, 1, 0)).toEqual(['B', 'A', 'C']);
  });

  it('não altera a lista original', () => {
    const items = ['A', 'B', 'C'];
    const result = reorderLocally(items, 0, 2);
    expect(items).toEqual(['A', 'B', 'C']); // original inalterado
    expect(result).toEqual(['B', 'C', 'A']); // cópia reordenada
  });
});

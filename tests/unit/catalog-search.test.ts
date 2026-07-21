import { describe, it, expect } from 'vitest';

// =============================================================================
// Testes de busca do catálogo (lógica de filtragem client-side)
// =============================================================================

function normalize(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

interface Category {
  id: string;
  name: string;
}

interface Product {
  id: string;
  name: string;
  category: { id: string };
}

function filterCatalog(
  categories: Category[],
  products: Product[],
  query: string,
) {
  const q = normalize(query.trim());
  if (!q) return { categories, products };

  const filteredCategories = categories.filter(
    (c) =>
      normalize(c.name).includes(q) ||
      products.some((p) => p.category.id === c.id && normalize(p.name).includes(q)),
  );

  const filteredProducts = products.filter(
    (p) =>
      normalize(p.name).includes(q) ||
      categories.some((c) => c.id === p.category.id && normalize(c.name).includes(q)),
  );

  return { categories: filteredCategories, products: filteredProducts };
}

describe('CatalogClientView — busca client-side', () => {
  const categories: Category[] = [
    { id: 'cat-1', name: 'Hambúrgueres' },
    { id: 'cat-2', name: 'Bebidas' },
    { id: 'cat-3', name: 'Sobremesas' },
  ];

  const products: Product[] = [
    { id: 'p-1', name: 'X-Burguer Clássico', category: { id: 'cat-1' } },
    { id: 'p-2', name: 'X-Bacon Duplo', category: { id: 'cat-1' } },
    { id: 'p-3', name: 'Suco de Laranja', category: { id: 'cat-2' } },
    { id: 'p-4', name: 'Água Mineral', category: { id: 'cat-2' } },
    { id: 'p-5', name: 'Brownie de Chocolate', category: { id: 'cat-3' } },
  ];

  it('retorna tudo com query vazia', () => {
    const result = filterCatalog(categories, products, '');
    expect(result.categories).toHaveLength(3);
    expect(result.products).toHaveLength(5);
  });

  it('filtra por nome de produto (case insensitive)', () => {
    const result = filterCatalog(categories, products, 'burguer');
    expect(result.products).toHaveLength(2);
    expect(result.categories).toHaveLength(1);
    expect(result.categories[0].id).toBe('cat-1');
  });

  it('filtra por nome de categoria', () => {
    const result = filterCatalog(categories, products, 'bebidas');
    expect(result.categories).toHaveLength(1);
    expect(result.categories[0].id).toBe('cat-2');
  });

  it('normaliza acentos na busca', () => {
    // "Hamburguer" sem acento encontra "Hambúrgueres"
    const result = filterCatalog(categories, products, 'hamburguer');
    expect(result.categories.some((c) => c.id === 'cat-1')).toBe(true);
  });

  it('retorna resultado vazio para query sem correspondência', () => {
    const result = filterCatalog(categories, products, 'pizza');
    expect(result.categories).toHaveLength(0);
    expect(result.products).toHaveLength(0);
  });

  it('ignora maiúsculas na busca', () => {
    const result = filterCatalog(categories, products, 'CHOCOLATE');
    expect(result.products).toHaveLength(1);
    expect(result.products[0].id).toBe('p-5');
  });

  it('busca parcial funciona', () => {
    const result = filterCatalog(categories, products, 'água');
    expect(result.products).toHaveLength(1);
    expect(result.products[0].id).toBe('p-4');
  });

  it('inclui categoria quando produto bate mas nome da categoria não', () => {
    // "Clássico" está em produto de cat-1 mas não no nome da categoria
    const result = filterCatalog(categories, products, 'clássico');
    expect(result.categories.some((c) => c.id === 'cat-1')).toBe(true);
  });
});

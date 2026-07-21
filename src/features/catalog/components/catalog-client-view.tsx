'use client';

import Link from 'next/link';
import { useCallback, useState } from 'react';
import { AlertTriangle, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CatalogSearchBar } from '@/features/catalog/components/catalog-search-bar';
import { CatalogOrderControls } from '@/features/catalog/components/catalog-order-controls';
import { ProductAvailabilityToggle } from '@/features/catalog/components/product-availability-toggle';
import { formatCurrency } from '@/lib/utils';

interface ReadinessIssue {
  type: string;
  entityId: string;
  entityName: string;
  message: string;
}

interface Category {
  id: string;
  name: string;
  isActive: boolean;
  _count: { products: number };
}

interface Product {
  id: string;
  name: string;
  basePrice: number;
  isAvailable: boolean;
  isFeatured: boolean;
  isSoldOut: boolean;
  allowNotes: boolean;
  sortOrder: number;
  _count: { optionGroups: number };
  category: { id: string; name: string };
}

interface CatalogClientViewProps {
  categories: Category[];
  products: Product[];
  readinessIssues: ReadinessIssue[];
}

function normalize(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function CatalogClientView({ categories, products, readinessIssues }: CatalogClientViewProps) {
  const [query, setQuery] = useState('');

  const handleSearch = useCallback((q: string) => setQuery(q), []);

  const normalizedQuery = normalize(query.trim());

  const filteredCategories = normalizedQuery
    ? categories.filter(
        (c) =>
          normalize(c.name).includes(normalizedQuery) ||
          products.some(
            (p) => p.category.id === c.id && normalize(p.name).includes(normalizedQuery),
          ),
      )
    : categories;

  const filteredProducts = (categoryId: string) =>
    normalizedQuery
      ? products.filter(
          (p) =>
            p.category.id === categoryId &&
            (normalize(p.name).includes(normalizedQuery) ||
              normalize(p.category.name).includes(normalizedQuery)),
        )
      : products.filter((p) => p.category.id === categoryId);

  const totalProducts = products.length;
  const soldOutCount = products.filter((p) => p.isSoldOut).length;
  const unavailableCount = products.filter((p) => !p.isAvailable && !p.isSoldOut).length;

  return (
    <div className="space-y-5">
      {/* Estatísticas + Busca */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-3 text-sm">
          <span className="text-text-secondary">
            <span className="text-text-primary font-semibold">{categories.length}</span>{' '}
            {categories.length === 1 ? 'categoria' : 'categorias'}
          </span>
          <span className="text-text-tertiary">·</span>
          <span className="text-text-secondary">
            <span className="text-text-primary font-semibold">{totalProducts}</span>{' '}
            {totalProducts === 1 ? 'produto' : 'produtos'}
          </span>
          {soldOutCount > 0 && (
            <>
              <span className="text-text-tertiary">·</span>
              <span className="text-warning font-medium">{soldOutCount} esgotado{soldOutCount > 1 ? 's' : ''}</span>
            </>
          )}
          {unavailableCount > 0 && (
            <>
              <span className="text-text-tertiary">·</span>
              <span className="text-text-secondary">{unavailableCount} indisponível{unavailableCount > 1 ? 'is' : ''}</span>
            </>
          )}
          {readinessIssues.length > 0 && (
            <>
              <span className="text-text-tertiary">·</span>
              <span className="text-error font-medium flex items-center gap-1">
                <AlertTriangle className="h-3.5 w-3.5" />
                {readinessIssues.length} {readinessIssues.length === 1 ? 'problema' : 'problemas'}
              </span>
            </>
          )}
        </div>
        <CatalogSearchBar onSearch={handleSearch} />
      </div>

      {/* Alerta de readiness */}
      {readinessIssues.length > 0 && !normalizedQuery && (
        <div className="rounded-xl border border-warning/30 bg-warning/5 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="text-warning mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="text-text-primary font-semibold">
                {readinessIssues.length === 1
                  ? '1 problema encontrado no catálogo'
                  : `${readinessIssues.length} problemas encontrados`}
              </p>
              <ul className="text-text-secondary mt-1 space-y-1 text-sm">
                {readinessIssues.map((issue) => (
                  <li key={`${issue.type}-${issue.entityId}`}>
                    {'→ '}
                    <Link
                      href={
                        issue.type === 'empty_category'
                          ? `/dashboard/catalog/categories/${issue.entityId}/edit`
                          : `/dashboard/catalog/products/${issue.entityId}/edit`
                      }
                      className="text-brand-600 hover:underline"
                    >
                      {issue.message}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Sem resultados de busca */}
      {normalizedQuery && filteredCategories.length === 0 && (
        <div className="text-text-secondary rounded-xl border border-dashed border-border py-12 text-center text-sm">
          Nenhum resultado para &ldquo;{query}&rdquo;
        </div>
      )}

      {/* Lista de categorias e produtos */}
      {filteredCategories.map((category, categoryIndex) => {
        const categoryProducts = filteredProducts(category.id);
        const categoryIssues = readinessIssues.filter((i) => i.entityId === category.id);

        return (
          <div key={category.id} className="border-border bg-surface rounded-xl border">
            {/* Cabeçalho da categoria */}
            <div className="border-border flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <h2 className="text-text-primary font-semibold">{category.name}</h2>
                <Badge variant={category.isActive ? 'success' : 'secondary'}>
                  {category.isActive ? 'Ativa' : 'Inativa'}
                </Badge>
                {categoryIssues.length > 0 && (
                  <Badge variant="warning">
                    <AlertTriangle className="h-3 w-3" />
                    Atenção
                  </Badge>
                )}
                <span className="text-text-secondary text-sm">
                  {category._count.products}{' '}
                  {category._count.products === 1 ? 'produto' : 'produtos'}
                </span>
              </div>
              <div className="flex items-center gap-1 self-start sm:self-auto">
                {!normalizedQuery && (
                  <CatalogOrderControls
                    id={category.id}
                    kind="category"
                    label={`categoria ${category.name}`}
                    canMoveUp={categoryIndex > 0}
                    canMoveDown={categoryIndex < filteredCategories.length - 1}
                  />
                )}
                <Button asChild variant="ghost" size="sm">
                  <Link href={`/dashboard/catalog/categories/${category.id}/edit`}>Editar</Link>
                </Button>
              </div>
            </div>

            {/* Produtos */}
            {categoryProducts.length > 0 ? (
              <div className="divide-border divide-y">
                {categoryProducts.map((product, productIndex) => {
                  const productIssues = readinessIssues.filter((i) => i.entityId === product.id);

                  return (
                    <div
                      key={product.id}
                      className={`hover:bg-surface-secondary flex min-h-16 flex-col gap-2 px-4 py-3 transition-colors sm:flex-row sm:items-center ${productIssues.length > 0 ? 'border-l-2 border-warning' : ''}`}
                    >
                      <Link
                        href={`/dashboard/catalog/products/${product.id}/edit`}
                        className="focus-visible:ring-brand-500 flex min-h-11 min-w-0 flex-1 flex-col justify-center rounded-lg py-1 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                      >
                        <p className="text-text-primary font-medium">{product.name}</p>
                        {productIssues.length > 0 ? (
                          <p className="text-warning text-xs">{productIssues[0].message}</p>
                        ) : product._count.optionGroups > 0 ? (
                          <p className="text-text-secondary text-xs">
                            {product._count.optionGroups}{' '}
                            {product._count.optionGroups === 1
                              ? 'grupo de adicionais'
                              : 'grupos de adicionais'}
                          </p>
                        ) : null}
                      </Link>

                      <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-end">
                        <span className="text-text-primary font-mono font-semibold">
                          {formatCurrency(product.basePrice)}
                        </span>
                        <div className="flex items-center gap-1.5">
                          {product.isSoldOut && <Badge variant="warning">Esgotado</Badge>}
                          {!product.isAvailable && !product.isSoldOut && (
                            <Badge variant="secondary">Indisp.</Badge>
                          )}
                        </div>
                        <ProductAvailabilityToggle
                          productId={product.id}
                          isSoldOut={product.isSoldOut}
                        />
                        {!normalizedQuery && (
                          <CatalogOrderControls
                            id={product.id}
                            kind="product"
                            label={`produto ${product.name}`}
                            canMoveUp={productIndex > 0}
                            canMoveDown={productIndex < categoryProducts.length - 1}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : normalizedQuery ? (
              <div className="text-text-secondary px-4 py-3 text-sm">
                Nenhum produto nesta categoria corresponde à busca.
              </div>
            ) : (
              <div className="text-text-secondary flex flex-col gap-2 px-4 py-4 text-sm sm:flex-row sm:items-center sm:justify-between">
                <span>Nenhum produto nesta categoria.</span>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/dashboard/catalog/products/new">Adicionar produto</Link>
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

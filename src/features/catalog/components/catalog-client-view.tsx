'use client';

import Link from 'next/link';
import { useCallback, useMemo, useState } from 'react';
import { AlertTriangle, ArrowUpDown, ChevronDown, PackageOpen, SearchX } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CatalogOrderControls } from '@/features/catalog/components/catalog-order-controls';
import { CatalogProductThumbnail } from '@/features/catalog/components/catalog-product-thumbnail';
import { CatalogSearchBar } from '@/features/catalog/components/catalog-search-bar';
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
  imageUrl: string | null;
  imageAssetId: string | null;
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
  canManageCatalog: boolean;
  canReorderCatalog: boolean;
  canManageAvailability: boolean;
}

function normalize(value: string) {
  return value
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function plural(value: number, singular: string, pluralLabel: string) {
  return `${value} ${value === 1 ? singular : pluralLabel}`;
}

export function CatalogClientView({
  categories,
  products,
  readinessIssues,
  canManageCatalog,
  canReorderCatalog,
  canManageAvailability,
}: CatalogClientViewProps) {
  const [query, setQuery] = useState('');
  const [reorderMode, setReorderMode] = useState(false);

  const handleSearch = useCallback((nextQuery: string) => {
    setQuery(nextQuery);
    if (nextQuery.trim()) setReorderMode(false);
  }, []);

  const normalizedQuery = normalize(query.trim());
  const catalogIndex = useMemo(() => {
    const productsByCategory = new Map<string, Product[]>();
    const normalizedProductNames = new Map<string, string>();
    const normalizedCategoryNames = new Map<string, string>();

    for (const category of categories) {
      productsByCategory.set(category.id, []);
      normalizedCategoryNames.set(category.id, normalize(category.name));
    }
    for (const product of products) {
      const categoryProducts = productsByCategory.get(product.category.id) ?? [];
      categoryProducts.push(product);
      productsByCategory.set(product.category.id, categoryProducts);
      normalizedProductNames.set(product.id, normalize(product.name));
    }

    return { productsByCategory, normalizedProductNames, normalizedCategoryNames };
  }, [categories, products]);

  const issuesByEntity = useMemo(() => {
    const grouped = new Map<string, ReadinessIssue[]>();
    for (const issue of readinessIssues) {
      const current = grouped.get(issue.entityId) ?? [];
      current.push(issue);
      grouped.set(issue.entityId, current);
    }
    return grouped;
  }, [readinessIssues]);

  const visibleCatalog = useMemo(() => {
    if (!normalizedQuery) {
      return {
        categories,
        productsByCategory: catalogIndex.productsByCategory,
      };
    }

    const filteredProducts = new Map<string, Product[]>();
    const filteredCategories = categories.filter((category) => {
      const categoryMatches = catalogIndex.normalizedCategoryNames
        .get(category.id)
        ?.includes(normalizedQuery);
      const categoryProducts = catalogIndex.productsByCategory.get(category.id) ?? [];
      const matches = categoryMatches
        ? categoryProducts
        : categoryProducts.filter((product) =>
            catalogIndex.normalizedProductNames.get(product.id)?.includes(normalizedQuery),
          );
      if (matches.length > 0 || categoryMatches) {
        filteredProducts.set(category.id, matches);
        return true;
      }
      return false;
    });

    return { categories: filteredCategories, productsByCategory: filteredProducts };
  }, [catalogIndex, categories, normalizedQuery]);

  const soldOutCount = products.filter((product) => product.isSoldOut).length;
  const unavailableCount = products.filter(
    (product) => !product.isAvailable && !product.isSoldOut,
  ).length;
  const canShowReorderMode = canReorderCatalog && !normalizedQuery;

  return (
    <div className="space-y-4 sm:space-y-5">
      <section
        className="border-border bg-surface sticky top-16 z-20 rounded-xl border p-3 xl:top-[4.125rem]"
        aria-label="Ferramentas do catálogo"
      >
        <div className="flex items-center gap-2">
          <CatalogSearchBar onSearch={handleSearch} className="min-w-0 flex-1" />
          {canReorderCatalog ? (
            <Button
              type="button"
              variant={reorderMode ? 'secondary' : 'outline'}
              size="sm"
              className="shrink-0"
              aria-pressed={reorderMode}
              disabled={!canShowReorderMode}
              title={normalizedQuery ? 'Limpe a busca para organizar o catálogo' : undefined}
              onClick={() => setReorderMode((current) => !current)}
            >
              <ArrowUpDown aria-hidden="true" />
              <span className="hidden min-[360px]:inline">Organizar</span>
            </Button>
          ) : null}
        </div>

        <div className="border-border text-text-secondary mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t pt-3 text-xs sm:text-sm">
          <span>
            <strong className="text-text-primary font-mono">{categories.length}</strong>{' '}
            {categories.length === 1 ? 'categoria' : 'categorias'}
          </span>
          <span>
            <strong className="text-text-primary font-mono">{products.length}</strong>{' '}
            {products.length === 1 ? 'produto' : 'produtos'}
          </span>
          {soldOutCount > 0 ? (
            <span className="text-warning font-medium">
              {plural(soldOutCount, 'esgotado', 'esgotados')}
            </span>
          ) : null}
          {unavailableCount > 0 ? (
            <span>{plural(unavailableCount, 'indisponível', 'indisponíveis')}</span>
          ) : null}
          {readinessIssues.length > 0 ? (
            <span className="text-error inline-flex items-center gap-1 font-medium">
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
              {plural(readinessIssues.length, 'ajuste', 'ajustes')}
            </span>
          ) : (
            <span className="text-success font-medium">Pronto para vender</span>
          )}
        </div>

        {reorderMode ? (
          <p className="bg-info-light text-info mt-3 rounded-lg px-3 py-2 text-xs" role="status">
            Modo de organização ativo. Use as setas para alterar a ordem exibida no cardápio.
          </p>
        ) : null}
        <span className="sr-only" aria-live="polite">
          {normalizedQuery
            ? `${plural(visibleCatalog.categories.length, 'categoria encontrada', 'categorias encontradas')} para a busca.`
            : ''}
        </span>
      </section>

      {readinessIssues.length > 0 && !normalizedQuery ? (
        <details className="group border-warning/30 bg-warning-light overflow-hidden rounded-xl border">
          <summary className="focus-visible:ring-brand-500 flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3 focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset [&::-webkit-details-marker]:hidden">
            <AlertTriangle className="text-warning h-5 w-5 shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="text-text-primary block text-sm font-semibold">
                {plural(readinessIssues.length, 'ajuste necessário', 'ajustes necessários')}
              </span>
              <span className="text-text-secondary mt-0.5 block text-xs">
                Revise antes de publicar ou receber novos pedidos.
              </span>
            </span>
            <ChevronDown
              className="text-text-muted h-5 w-5 shrink-0 transition-transform group-open:rotate-180"
              aria-hidden="true"
            />
          </summary>
          <ul className="divide-warning/20 border-warning/20 bg-surface/65 divide-y border-t">
            {readinessIssues.map((issue) => (
              <li
                key={`${issue.type}-${issue.entityId}-${issue.message}`}
                className="flex items-start gap-2 px-4 py-3 text-sm"
              >
                <AlertTriangle
                  className="text-warning mt-0.5 h-4 w-4 shrink-0"
                  aria-hidden="true"
                />
                {canManageCatalog ? (
                  <Link
                    href={
                      issue.type === 'empty_category'
                        ? `/dashboard/catalog/categories/${issue.entityId}/edit`
                        : `/dashboard/catalog/products/${issue.entityId}/edit`
                    }
                    className="text-text-primary hover:text-brand-700 focus-visible:ring-brand-500 min-h-11 flex-1 rounded py-1 font-medium underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:outline-none"
                  >
                    {issue.message}
                  </Link>
                ) : (
                  <span className="text-text-secondary">{issue.message}</span>
                )}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {normalizedQuery && visibleCatalog.categories.length === 0 ? (
        <div className="border-border flex min-h-48 flex-col items-center justify-center rounded-xl border border-dashed px-4 py-8 text-center">
          <span className="bg-surface-secondary text-text-muted flex h-11 w-11 items-center justify-center rounded-full">
            <SearchX className="h-5 w-5" aria-hidden="true" />
          </span>
          <p className="text-text-primary mt-3 font-semibold">Nenhum item encontrado</p>
          <p className="text-text-secondary mt-1 max-w-sm text-sm">
            Não encontramos produtos ou categorias para &ldquo;{query.trim()}&rdquo;.
          </p>
        </div>
      ) : null}

      <div id="catalog-results" className="space-y-4" aria-label="Itens do catálogo">
        {visibleCatalog.categories.map((category, categoryIndex) => {
          const categoryProducts = visibleCatalog.productsByCategory.get(category.id) ?? [];
          const categoryIssues = issuesByEntity.get(category.id) ?? [];

          return (
            <section
              key={category.id}
              className="catalog-category-section border-border bg-surface overflow-hidden rounded-xl border"
              aria-labelledby={`catalog-category-${category.id}`}
            >
              <header className="border-border bg-surface-secondary/35 flex min-h-16 flex-wrap items-center justify-between gap-2 border-b px-3 py-2.5 sm:px-4">
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                  <h2
                    id={`catalog-category-${category.id}`}
                    className="text-text-primary min-w-0 font-semibold break-words"
                  >
                    {category.name}
                  </h2>
                  <Badge variant={category.isActive ? 'success' : 'secondary'}>
                    {category.isActive ? 'Ativa' : 'Inativa'}
                  </Badge>
                  {categoryIssues.length > 0 ? (
                    <Badge variant="warning">
                      <AlertTriangle className="h-3 w-3" aria-hidden="true" /> Atenção
                    </Badge>
                  ) : null}
                  <span className="text-text-secondary text-xs sm:text-sm">
                    {plural(category._count.products, 'produto', 'produtos')}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {reorderMode && canShowReorderMode ? (
                    <CatalogOrderControls
                      id={category.id}
                      kind="category"
                      label={`categoria ${category.name}`}
                      canMoveUp={categoryIndex > 0}
                      canMoveDown={categoryIndex < visibleCatalog.categories.length - 1}
                    />
                  ) : null}
                  {canManageCatalog ? (
                    <Button asChild variant="ghost" size="sm">
                      <Link
                        href={`/dashboard/catalog/categories/${category.id}/edit`}
                        aria-label={`Editar categoria ${category.name}`}
                      >
                        Editar
                      </Link>
                    </Button>
                  ) : null}
                </div>
              </header>

              {categoryProducts.length > 0 ? (
                <div className="divide-border divide-y">
                  {categoryProducts.map((product, productIndex) => {
                    const productIssues = issuesByEntity.get(product.id) ?? [];
                    const hasProductActions =
                      canManageCatalog ||
                      canManageAvailability ||
                      (reorderMode && canReorderCatalog);

                    return (
                      <article
                        key={product.id}
                        className={`hover:bg-surface-secondary grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2 px-3 py-3 transition-colors sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:px-4 ${productIssues.length > 0 ? 'bg-warning-light/55' : ''}`}
                        aria-labelledby={`catalog-product-${product.id}`}
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <CatalogProductThumbnail
                            name={product.name}
                            imageUrl={product.imageUrl}
                            imageAssetId={product.imageAssetId}
                          />
                          <div className="min-w-0">
                            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                              <h3
                                id={`catalog-product-${product.id}`}
                                className="text-text-primary min-w-0 text-sm font-semibold break-words sm:text-base"
                              >
                                {product.name}
                              </h3>
                              {product.isFeatured ? (
                                <Badge variant="outline">Destaque</Badge>
                              ) : null}
                              {product.isSoldOut ? <Badge variant="warning">Esgotado</Badge> : null}
                              {!product.isAvailable && !product.isSoldOut ? (
                                <Badge variant="secondary">Indisponível</Badge>
                              ) : null}
                            </div>
                            {productIssues.length > 0 ? (
                              <p className="text-warning mt-1 line-clamp-2 text-xs">
                                {productIssues[0]?.message}
                                {productIssues.length > 1
                                  ? ` · +${productIssues.length - 1} ${productIssues.length === 2 ? 'ajuste' : 'ajustes'}`
                                  : ''}
                              </p>
                            ) : product._count.optionGroups > 0 ? (
                              <p className="text-text-secondary mt-1 text-xs">
                                {plural(
                                  product._count.optionGroups,
                                  'grupo de adicionais',
                                  'grupos de adicionais',
                                )}
                              </p>
                            ) : (
                              <p className="text-text-muted mt-1 text-xs">Sem adicionais</p>
                            )}
                          </div>
                        </div>

                        <span className="text-text-primary font-mono text-sm font-bold whitespace-nowrap sm:text-base">
                          {formatCurrency(product.basePrice)}
                        </span>

                        {hasProductActions ? (
                          <div className="col-span-2 flex flex-wrap items-center justify-end gap-1 sm:col-span-1">
                            {canManageAvailability ? (
                              <ProductAvailabilityToggle
                                productId={product.id}
                                productName={product.name}
                                isSoldOut={product.isSoldOut}
                              />
                            ) : null}
                            {canManageCatalog ? (
                              <Button asChild variant="ghost" size="sm">
                                <Link
                                  href={`/dashboard/catalog/products/${product.id}/edit`}
                                  aria-label={`Editar produto ${product.name}`}
                                >
                                  Editar
                                </Link>
                              </Button>
                            ) : null}
                            {reorderMode && canShowReorderMode ? (
                              <CatalogOrderControls
                                id={product.id}
                                kind="product"
                                label={`produto ${product.name}`}
                                canMoveUp={productIndex > 0}
                                canMoveDown={productIndex < categoryProducts.length - 1}
                              />
                            ) : null}
                          </div>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              ) : normalizedQuery ? (
                <div className="text-text-secondary px-4 py-4 text-sm">
                  A categoria corresponde à busca, mas nenhum produto possui esse termo.
                </div>
              ) : (
                <div className="flex flex-col items-start gap-3 px-4 py-5 text-sm sm:flex-row sm:items-center sm:justify-between">
                  <span className="text-text-secondary flex items-center gap-2">
                    <PackageOpen className="text-text-muted h-5 w-5" aria-hidden="true" />
                    Nenhum produto nesta categoria.
                  </span>
                  {canManageCatalog ? (
                    <Button asChild variant="outline" size="sm">
                      <Link href="/dashboard/catalog/products/new">Adicionar produto</Link>
                    </Button>
                  ) : null}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

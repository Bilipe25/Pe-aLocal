import Link from 'next/link';
import { AlertTriangle, Archive, Plus, UtensilsCrossed } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { listCategoriesAction, listProductsAction } from '@/features/catalog/actions';
import { formatCurrency } from '@/lib/utils';
import { CatalogOrderControls } from '@/features/catalog/components/catalog-order-controls';
import { ProductAvailabilityToggle } from '@/features/catalog/components/product-availability-toggle';
import { requireActiveStoreContext } from '@/server/services/store-context.service';
import { analyzeCatalogReadiness } from '@/server/services/catalog-readiness.service';

export const metadata = { title: 'Catálogo' };

export default async function CatalogPage() {
  const [{ session, store }, categories, products] = await Promise.all([
    requireActiveStoreContext(),
    listCategoriesAction(),
    listProductsAction(),
  ]);

  const readinessIssues = await analyzeCatalogReadiness(session.tenantId, store.id);

  return (
    <div>
      <PageHeader
        title="Catálogo"
        description="Gerencie categorias e produtos do cardápio."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link href="/dashboard/catalog/archived">
                <Archive className="h-4 w-4" />
                Arquivados
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard/catalog/categories/new">
                <Plus className="h-4 w-4" /> Categoria
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/dashboard/catalog/products/new">
                <Plus className="h-4 w-4" /> Produto
              </Link>
            </Button>
          </div>
        }
      />

      {/* Readiness warnings */}
      {readinessIssues.length > 0 && (
        <div className="mb-6 rounded-xl border border-warning/30 bg-warning/5 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="text-warning mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="text-text-primary font-semibold">
                {readinessIssues.length === 1
                  ? '1 problema encontrado no catálogo'
                  : `${readinessIssues.length} problemas encontrados no catálogo`}
              </p>
              <ul className="text-text-secondary mt-1 space-y-1 text-sm">
                {readinessIssues.map((issue) => (
                  <li key={`${issue.type}-${issue.entityId}`}>
                    {'→ '}
                    {issue.type === 'empty_category' ? (
                      <Link
                        href={`/dashboard/catalog/categories/${issue.entityId}/edit`}
                        className="text-brand-600 hover:underline"
                      >
                        {issue.message}
                      </Link>
                    ) : (
                      <Link
                        href={`/dashboard/catalog/products/${issue.entityId}/edit`}
                        className="text-brand-600 hover:underline"
                      >
                        {issue.message}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {categories.length === 0 ? (
        <EmptyState
          icon={<UtensilsCrossed className="h-6 w-6" />}
          title="Nenhuma categoria"
          description="Crie sua primeira categoria para começar a montar o cardápio."
          actionLabel="Criar categoria"
          actionHref="/dashboard/catalog/categories/new"
        />
      ) : (
        <div className="space-y-6">
          {categories.map((category, categoryIndex) => {
            const categoryProducts = products.filter((p) => p.category.id === category.id);
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
                    <CatalogOrderControls
                      id={category.id}
                      kind="category"
                      label={`categoria ${category.name}`}
                      canMoveUp={categoryIndex > 0}
                      canMoveDown={categoryIndex < categories.length - 1}
                    />
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/dashboard/catalog/categories/${category.id}/edit`}>
                        Editar
                      </Link>
                    </Button>
                  </div>
                </div>

                {/* Produtos da categoria */}
                {categoryProducts.length > 0 ? (
                  <div className="divide-border divide-y">
                    {categoryProducts.map((product, productIndex) => {
                      const productIssues = readinessIssues.filter(
                        (i) => i.entityId === product.id,
                      );

                      return (
                        <div
                          key={product.id}
                          className={`hover:bg-surface-secondary flex min-h-16 flex-col gap-2 px-4 py-3 transition-colors sm:flex-row sm:items-center ${productIssues.length > 0 ? 'border-l-2 border-warning' : ''}`}
                        >
                          {/* Área clicável — vai para edição */}
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

                          {/* Controles direitos */}
                          <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-end">
                            <span className="text-text-primary font-mono font-semibold">
                              {formatCurrency(product.basePrice)}
                            </span>

                            {/* Badges de status */}
                            <div className="flex items-center gap-1.5">
                              {product.isSoldOut && (
                                <Badge variant="warning">Esgotado</Badge>
                              )}
                              {!product.isAvailable && !product.isSoldOut && (
                                <Badge variant="secondary">Indisp.</Badge>
                              )}
                            </div>

                            {/* Toggle de esgotado — acessível para ATTENDANT */}
                            <ProductAvailabilityToggle
                              productId={product.id}
                              isSoldOut={product.isSoldOut}
                            />

                            <CatalogOrderControls
                              id={product.id}
                              kind="product"
                              label={`produto ${product.name}`}
                              canMoveUp={productIndex > 0}
                              canMoveDown={productIndex < categoryProducts.length - 1}
                            />
                          </div>
                        </div>
                      );
                    })}
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
      )}
    </div>
  );
}

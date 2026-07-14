import Link from 'next/link';
import { Plus, UtensilsCrossed } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { listCategoriesAction, listProductsAction } from '@/features/catalog/actions';
import { formatCurrency } from '@/lib/utils';

export const metadata = { title: 'Catálogo' };

export default async function CatalogPage() {
  const [categories, products] = await Promise.all([
    listCategoriesAction(),
    listProductsAction(),
  ]);

  return (
    <div>
      <PageHeader
        title="Catálogo"
        description="Gerencie categorias e produtos do cardápio."
        backHref="/dashboard"
        actions={
          <div className="flex gap-2">
            <Link href="/dashboard/catalog/categories/new">
              <Button variant="outline" size="sm">
                <Plus className="h-4 w-4" /> Categoria
              </Button>
            </Link>
            <Link href="/dashboard/catalog/products/new">
              <Button size="sm">
                <Plus className="h-4 w-4" /> Produto
              </Button>
            </Link>
          </div>
        }
      />

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
          {categories.map((category) => {
            const categoryProducts = products.filter((p) => p.category.id === category.id);

            return (
              <div key={category.id} className="rounded-xl border border-border bg-surface">
                <div className="flex items-center justify-between border-b border-border px-4 py-3">
                  <div className="flex items-center gap-2">
                    <h2 className="font-semibold text-text-primary">{category.name}</h2>
                    <Badge variant={category.isActive ? 'success' : 'secondary'}>
                      {category.isActive ? 'Ativa' : 'Inativa'}
                    </Badge>
                    <span className="text-xs text-text-tertiary">
                      {category._count.products} {category._count.products === 1 ? 'produto' : 'produtos'}
                    </span>
                  </div>
                  <Link href={`/dashboard/catalog/categories/${category.id}/edit`}>
                    <Button variant="ghost" size="sm">Editar</Button>
                  </Link>
                </div>

                {categoryProducts.length > 0 ? (
                  <div className="divide-y divide-border">
                    {categoryProducts.map((product) => (
                      <Link
                        key={product.id}
                        href={`/dashboard/catalog/products/${product.id}/edit`}
                        className="flex items-center justify-between px-4 py-3 transition-colors hover:bg-surface-secondary"
                      >
                        <div>
                          <p className="font-medium text-text-primary">{product.name}</p>
                          <p className="text-sm text-text-secondary">
                            {product._count.optionGroups > 0 && `${product._count.optionGroups} grupo(s) de adicionais`}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-text-primary">
                            {formatCurrency(product.basePrice)}
                          </span>
                          {!product.isAvailable && (
                            <Badge variant="destructive">Indisponível</Badge>
                          )}
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <p className="px-4 py-4 text-sm text-text-tertiary">Nenhum produto nesta categoria.</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

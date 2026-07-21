import Link from 'next/link';
import { Archive, Plus, UtensilsCrossed } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';
import { listCategoriesAction, listProductsAction } from '@/features/catalog/actions';
import { CatalogClientView } from '@/features/catalog/components/catalog-client-view';
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

      {categories.length === 0 ? (
        <EmptyState
          icon={<UtensilsCrossed className="h-6 w-6" />}
          title="Nenhuma categoria"
          description="Crie sua primeira categoria para começar a montar o cardápio."
          actionLabel="Criar categoria"
          actionHref="/dashboard/catalog/categories/new"
        />
      ) : (
        <CatalogClientView
          categories={categories}
          products={products}
          readinessIssues={readinessIssues}
        />
      )}
    </div>
  );
}

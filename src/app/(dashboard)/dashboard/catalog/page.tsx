import Link from 'next/link';
import { Archive, Plus, UtensilsCrossed } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';
import { CatalogClientView } from '@/features/catalog/components/catalog-client-view';
import { hasTenantPermission, Permission } from '@/server/permissions';
import * as categoryRepo from '@/server/repositories/category.repository';
import * as productRepo from '@/server/repositories/product.repository';
import { requireActiveStoreContext } from '@/server/services/store-context.service';
import { analyzeCatalogReadiness } from '@/server/services/catalog-readiness.service';

export const metadata = { title: 'Catálogo' };

export default async function CatalogPage() {
  const { session, store } = await requireActiveStoreContext(Permission.VIEW_CATALOG);
  const [categories, products, readinessIssues] = await Promise.all([
    categoryRepo.listCategories(session.tenantId, store.id),
    productRepo.listProducts(session.tenantId, store.id),
    analyzeCatalogReadiness(session.tenantId, store.id),
  ]);
  const canManageCatalog = hasTenantPermission(session.tenantRole, Permission.MANAGE_CATALOG);
  const canArchiveCatalog = hasTenantPermission(
    session.tenantRole,
    Permission.ARCHIVE_CATALOG_ITEMS,
  );
  const canReorderCatalog = hasTenantPermission(session.tenantRole, Permission.REORDER_CATALOG);
  const canManageAvailability = hasTenantPermission(
    session.tenantRole,
    Permission.MANAGE_PRODUCT_AVAILABILITY,
  );

  return (
    <div>
      <PageHeader
        title="Catálogo"
        description={
          canManageCatalog
            ? 'Organize produtos, preços e disponibilidade do cardápio.'
            : 'Consulte o cardápio e atualize a disponibilidade dos produtos.'
        }
        actions={
          <div className="flex w-full items-center gap-2 sm:w-auto">
            {canManageCatalog && (
              <>
                <Button asChild size="sm" className="flex-1 sm:flex-none">
                  <Link href="/dashboard/catalog/products/new">
                    <Plus className="h-4 w-4" /> Novo produto
                  </Link>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link
                    href="/dashboard/catalog/categories/new"
                    aria-label="Criar nova categoria"
                    title="Nova categoria"
                  >
                    <Plus className="h-4 w-4" />
                    <span className="hidden sm:inline">Categoria</span>
                  </Link>
                </Button>
              </>
            )}
            {canArchiveCatalog && (
              <Button asChild variant="ghost" size="sm">
                <Link href="/dashboard/catalog/archived" aria-label="Ver itens arquivados">
                  <Archive className="h-4 w-4" />
                  <span className="hidden sm:inline">Arquivados</span>
                </Link>
              </Button>
            )}
          </div>
        }
      />

      {categories.length === 0 ? (
        <EmptyState
          icon={<UtensilsCrossed className="h-6 w-6" />}
          title="Nenhuma categoria"
          description={
            canManageCatalog
              ? 'Crie sua primeira categoria para começar a montar o cardápio.'
              : 'O catálogo ainda não possui categorias. Fale com o responsável pela loja.'
          }
          actionLabel={canManageCatalog ? 'Criar categoria' : undefined}
          actionHref={canManageCatalog ? '/dashboard/catalog/categories/new' : undefined}
        />
      ) : (
        <CatalogClientView
          categories={categories}
          products={products}
          readinessIssues={readinessIssues}
          canManageCatalog={canManageCatalog}
          canReorderCatalog={canReorderCatalog}
          canManageAvailability={canManageAvailability}
        />
      )}
    </div>
  );
}

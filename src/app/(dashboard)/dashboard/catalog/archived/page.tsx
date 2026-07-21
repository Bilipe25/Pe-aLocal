import Link from 'next/link';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { listArchivedCatalogAction } from '@/features/catalog/actions';
import { ArchivedCatalogPanel } from '@/features/catalog/components/archived-catalog-panel';

export const metadata = { title: 'Itens Arquivados — Catálogo' };

export default async function ArchivedCatalogPage() {
  const { categories, products } = await listArchivedCatalogAction();

  return (
    <div>
      <PageHeader
        title="Itens Arquivados"
        description="Restaure categorias ou produtos arquivados para o catálogo."
        backHref="/dashboard/catalog"
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/catalog">
              ← Voltar ao catálogo
            </Link>
          </Button>
        }
      />
      <ArchivedCatalogPanel categories={categories} products={products} />
    </div>
  );
}

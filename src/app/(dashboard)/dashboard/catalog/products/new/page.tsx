import { PageHeader } from '@/components/shared/page-header';
import { ProductForm } from '@/features/catalog/components/product-form';
import { ProductSetupProgress } from '@/features/catalog/components/product-setup-progress';
import { EmptyState } from '@/components/shared/empty-state';
import { UtensilsCrossed } from 'lucide-react';
import { Permission } from '@/server/permissions';
import * as categoryRepo from '@/server/repositories/category.repository';
import { requireActiveStoreContext } from '@/server/services/store-context.service';

export const metadata = { title: 'Novo produto' };

export default async function NewProductPage() {
  const { session, store } = await requireActiveStoreContext(Permission.MANAGE_CATALOG);
  const categories = await categoryRepo.listCategories(session.tenantId, store.id);

  return (
    <div>
      <PageHeader
        title="Novo produto"
        description="Comece pelos dados principais. Depois você poderá configurar os adicionais."
        backHref="/dashboard/catalog"
      />
      {categories.length === 0 ? (
        <EmptyState
          icon={<UtensilsCrossed aria-hidden="true" />}
          title="Crie uma categoria primeiro"
          description="Todo produto precisa pertencer a uma categoria do cardápio."
          actionLabel="Criar categoria"
          actionHref="/dashboard/catalog/categories/new"
        />
      ) : (
        <div className="max-w-3xl">
          <ProductSetupProgress currentStep={1} />
          <section
            className="border-border bg-surface rounded-xl border p-4 sm:p-6"
            aria-labelledby="product-data-heading"
          >
            <h2 id="product-data-heading" className="text-text-primary mb-5 text-lg font-semibold">
              Dados do produto
            </h2>
            <ProductForm categories={categories} />
          </section>
        </div>
      )}
    </div>
  );
}

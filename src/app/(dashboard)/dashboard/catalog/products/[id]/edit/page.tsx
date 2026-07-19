import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/shared/page-header';
import { ProductForm } from '@/features/catalog/components/product-form';
import { getProductAction, listCategoriesAction } from '@/features/catalog/actions';
import { ProductOptionGroupsEditor } from '@/features/catalog/components/product-option-groups-editor';
import { ProductSetupProgress } from '@/features/catalog/components/product-setup-progress';

export const metadata = { title: 'Editar produto' };

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [product, categories] = await Promise.all([getProductAction(id), listCategoriesAction()]);

  if (!product) {
    notFound();
  }

  return (
    <div>
      <PageHeader
        title={product.name}
        description="Edite os dados, configure os adicionais e volte ao catálogo quando terminar."
        backHref="/dashboard/catalog"
      />
      <ProductSetupProgress currentStep={2} />
      <section
        className="border-border bg-surface max-w-3xl rounded-xl border p-4 sm:p-6"
        aria-labelledby="product-data-heading"
      >
        <h2 id="product-data-heading" className="text-text-primary mb-5 text-lg font-semibold">
          Dados do produto
        </h2>
        <ProductForm categories={categories} product={product} />
      </section>
      <ProductOptionGroupsEditor productId={product.id} groups={product.optionGroups} />
    </div>
  );
}

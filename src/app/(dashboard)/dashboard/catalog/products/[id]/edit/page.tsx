import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/shared/page-header';
import { ProductForm } from '@/features/catalog/components/product-form';
import { ProductOptionGroupsEditor } from '@/features/catalog/components/product-option-groups-editor';
import { ProductSetupProgress } from '@/features/catalog/components/product-setup-progress';
import { ProductImageUpload } from '@/features/catalog/components/product-image-upload';
import { tenantStoreAssetUrl } from '@/features/assets/urls';
import { Permission } from '@/server/permissions';
import * as categoryRepo from '@/server/repositories/category.repository';
import * as productRepo from '@/server/repositories/product.repository';
import { requireActiveStoreContext } from '@/server/services/store-context.service';

export const metadata = { title: 'Editar produto' };

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { session, store } = await requireActiveStoreContext(Permission.MANAGE_CATALOG);
  const [product, categories] = await Promise.all([
    productRepo.findProductById(id, session.tenantId),
    categoryRepo.listCategories(session.tenantId, store.id),
  ]);

  if (!product || product.storeId !== store.id) {
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

        {/* Imagem do produto — Fase 6 */}
        <div className="mb-6">
          <ProductImageUpload
            productId={product.id}
            productName={product.name}
            currentImageUrl={
              product.imageAssetId
                ? tenantStoreAssetUrl(product.imageAssetId, 768)
                : product.imageUrl
            }
          />
        </div>

        <ProductForm categories={categories} product={product} />
      </section>
      <ProductOptionGroupsEditor productId={product.id} groups={product.optionGroups} />
    </div>
  );
}

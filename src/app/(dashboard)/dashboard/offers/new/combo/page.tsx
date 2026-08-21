import { PageHeader } from '@/components/shared/page-header';
import { ComboForm } from '@/features/offers/components/combo-form';
import { getOfferEditorProducts } from '@/server/services/offer.service';

export const metadata = { title: 'Criar combo' };

export default async function NewComboPage({
  searchParams,
}: {
  searchParams: Promise<{ products?: string }>;
}) {
  const query = await searchParams;
  const data = await getOfferEditorProducts();
  const products = data.products.map((product) => ({
    id: product.id,
    name: product.name,
    basePrice: product.basePrice,
    isAvailable: product.isAvailable,
    isSoldOut: product.isSoldOut,
    categoryName: product.category.name,
  }));
  const allowedProductIds = new Set(products.map((product) => product.id));
  const initialProductIds = [...new Set((query.products ?? '').split(','))]
    .filter((productId) => allowedProductIds.has(productId))
    .slice(0, 10);
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Criar combo"
        description="Componentes reais, preço especial e agenda local."
        backHref="/dashboard/offers/new"
      />
      <ComboForm products={products} initialProductIds={initialProductIds} />
    </div>
  );
}

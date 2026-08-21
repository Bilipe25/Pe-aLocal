import { PageHeader } from '@/components/shared/page-header';
import { ComboForm } from '@/features/offers/components/combo-form';
import { getOfferEditorProducts } from '@/server/services/offer.service';

export const metadata = { title: 'Criar combo' };

export default async function NewComboPage() {
  const data = await getOfferEditorProducts();
  const products = data.products.map((product) => ({
    id: product.id,
    name: product.name,
    basePrice: product.basePrice,
    isAvailable: product.isAvailable,
    isSoldOut: product.isSoldOut,
    categoryName: product.category.name,
  }));
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Criar combo" description="Componentes reais, preço especial e agenda local." backHref="/dashboard/offers/new" />
      <ComboForm products={products} />
    </div>
  );
}

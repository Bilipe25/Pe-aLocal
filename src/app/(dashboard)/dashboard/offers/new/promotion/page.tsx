import { PageHeader } from '@/components/shared/page-header';
import { PromotionForm } from '@/features/offers/components/promotion-form';
import { getOfferEditorProducts } from '@/server/services/offer.service';

export const metadata = { title: 'Criar promoção' };

export default async function NewPromotionPage() {
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
      <PageHeader
        title="Criar promoção"
        description="Preço promocional do produto-base com agenda simples."
        backHref="/dashboard/offers/new"
      />
      <PromotionForm products={products} />
    </div>
  );
}

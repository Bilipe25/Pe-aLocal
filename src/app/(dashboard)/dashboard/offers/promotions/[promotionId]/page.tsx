import { PageHeader } from '@/components/shared/page-header';
import { PromotionForm } from '@/features/offers/components/promotion-form';
import {
  getOfferEditorProducts,
  getProductPromotionForActiveStore,
} from '@/server/services/offer.service';

export const metadata = { title: 'Editar promoção' };

export default async function EditPromotionPage({
  params,
}: {
  params: Promise<{ promotionId: string }>;
}) {
  const { promotionId } = await params;
  const [details, editor] = await Promise.all([
    getProductPromotionForActiveStore(promotionId),
    getOfferEditorProducts(),
  ]);
  const products = editor.products.map((product) => ({
    id: product.id,
    name: product.name,
    basePrice: product.basePrice,
    isAvailable: product.isAvailable,
    isSoldOut: product.isSoldOut,
    categoryName: product.category.name,
  }));
  const promotion = {
    id: details.promotion.id,
    version: details.promotion.version,
    productId: details.promotion.productId,
    promotionalPrice: details.promotion.promotionalPrice,
    isActive: details.promotion.isActive,
    startsOn: details.promotion.startsOn?.toISOString().slice(0, 10) ?? null,
    endsOnExclusive: details.promotion.endsOnExclusive?.toISOString().slice(0, 10) ?? null,
    weekdays: details.promotion.weekdays,
    startMinute: details.promotion.startMinute,
    endMinuteExclusive: details.promotion.endMinuteExclusive,
  };
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Editar promoção"
        description="Preço e agenda são revalidados de forma autoritativa."
        backHref="/dashboard/offers"
      />
      <PromotionForm products={products} promotion={promotion} />
    </div>
  );
}

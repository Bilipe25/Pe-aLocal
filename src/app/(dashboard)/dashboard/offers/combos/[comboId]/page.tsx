import { PageHeader } from '@/components/shared/page-header';
import { ComboForm } from '@/features/offers/components/combo-form';
import { getComboForActiveStore, getOfferEditorProducts } from '@/server/services/offer.service';

export const metadata = { title: 'Editar combo' };

export default async function EditComboPage({ params }: { params: Promise<{ comboId: string }> }) {
  const { comboId } = await params;
  const [details, editor] = await Promise.all([
    getComboForActiveStore(comboId),
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
  const combo = {
    id: details.combo.id,
    version: details.combo.version,
    name: details.combo.name,
    description: details.combo.description,
    specialPrice: details.combo.specialPrice,
    isActive: details.combo.isActive,
    sortOrder: details.combo.sortOrder,
    startsOn: details.combo.startsOn?.toISOString().slice(0, 10) ?? null,
    endsOnExclusive: details.combo.endsOnExclusive?.toISOString().slice(0, 10) ?? null,
    weekdays: details.combo.weekdays,
    startMinute: details.combo.startMinute,
    endMinuteExclusive: details.combo.endMinuteExclusive,
    items: details.combo.items.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
    })),
  };
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Editar combo"
        description="Uma alteração publicada incrementa a versão usada no checkout."
        backHref="/dashboard/offers"
      />
      <ComboForm products={products} combo={combo} />
    </div>
  );
}

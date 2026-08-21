import { PageHeader } from '@/components/shared/page-header';
import { CanonicalOfferForm } from '@/features/offers/components/canonical-offer-form';
import { getOfferEditorProducts } from '@/server/services/offer.service';
import { canonicalOfferKindSchema } from '@/schemas/offers';

export const metadata = { title: 'Criar oferta automática' };

export default async function NewAutomaticOfferPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  const requestedKind = canonicalOfferKindSchema.safeParse((await searchParams).kind);
  const { products } = await getOfferEditorProducts();
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Criar oferta automática"
        description="Defina a vantagem, os limites e quando ela pode ser aplicada. O servidor sempre recalcula o preço final."
        backHref="/dashboard/offers/new"
      />
      <CanonicalOfferForm
        initialKind={requestedKind.success ? requestedKind.data : undefined}
        products={products.map((product) => ({
          id: product.id,
          name: product.name,
          basePrice: product.basePrice,
          isAvailable: product.isAvailable,
          isSoldOut: product.isSoldOut,
          categoryName: product.category.name,
        }))}
      />
    </div>
  );
}

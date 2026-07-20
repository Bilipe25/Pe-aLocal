import { PageHeader } from '@/components/shared/page-header';
import { AddressForm } from '@/features/stores/components/address-form';
import { getStoreForDashboard } from '@/features/stores/actions';

export const metadata = { title: 'Endereço' };

export default async function StoreAddressPage({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  const store = await getStoreForDashboard(storeId);

  return (
    <div>
      <PageHeader
        title="Endereço"
        description="Informe o local usado como referência para retirada e entregas desta unidade."
        backHref={`/dashboard/stores/${storeId}`}
      />
      <section
        className="border-border bg-surface max-w-3xl rounded-xl border p-4 sm:p-6"
        aria-label="Dados do endereço"
      >
        <AddressForm storeId={storeId} address={store.address} />
      </section>
    </div>
  );
}

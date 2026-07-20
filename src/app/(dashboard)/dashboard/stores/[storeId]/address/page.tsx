import { PageHeader } from '@/components/shared/page-header';
import { ReadOnlyNotice } from '@/components/shared/read-only-notice';
import { AddressForm } from '@/features/stores/components/address-form';
import { loadStorePageData } from '@/features/stores/page-access';
import { getStoreAddressSettings } from '@/server/services/store-settings.service';

export const metadata = { title: 'Endereço' };

export default async function StoreAddressPage({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  const { store, canEdit } = await loadStorePageData(() => getStoreAddressSettings(storeId));

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
        {!canEdit && <ReadOnlyNotice />}
        <AddressForm storeId={storeId} address={store.address} readOnly={!canEdit} />
      </section>
    </div>
  );
}

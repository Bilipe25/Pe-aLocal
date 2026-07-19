import { PageHeader } from '@/components/shared/page-header';
import { getStoreForDashboard } from '@/features/stores/actions';
import { AddressForm } from '@/features/stores/components/address-form';

export const metadata = { title: 'Endereço' };

export default async function StoreAddressPage() {
  const store = await getStoreForDashboard();

  return (
    <div>
      <PageHeader
        title="Endereço"
        description="Informe o local usado como referência para retirada e cálculo das entregas."
        backHref="/dashboard/store"
      />
      <section className="max-w-3xl rounded-xl border border-border bg-surface p-4 sm:p-6" aria-label="Dados do endereço">
          <AddressForm address={store.address} />
      </section>
    </div>
  );
}

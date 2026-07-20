import { PageHeader } from '@/components/shared/page-header';
import { StoreGeneralForm } from '@/features/stores/components/store-general-form';
import { getStoreForDashboard } from '@/features/stores/actions';

export const metadata = { title: 'Informações gerais' };

export default async function StoreGeneralPage({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  const store = await getStoreForDashboard(storeId);

  return (
    <div>
      <PageHeader
        title="Informações gerais"
        description="Nome, endereço público, descrição e contatos da unidade."
        backHref={`/dashboard/stores/${storeId}`}
      />
      <section
        className="border-border bg-surface max-w-3xl rounded-xl border p-4 sm:p-6"
        aria-label="Dados da loja"
      >
        <StoreGeneralForm storeId={storeId} store={store} />
      </section>
    </div>
  );
}

import { PageHeader } from '@/components/shared/page-header';
import { ReadOnlyNotice } from '@/components/shared/read-only-notice';
import { StoreGeneralForm } from '@/features/stores/components/store-general-form';
import { loadStorePageData } from '@/features/stores/page-access';
import { getStoreGeneralSettings } from '@/server/services/store-settings.service';

export const metadata = { title: 'Informações gerais' };

export default async function StoreGeneralPage({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  const { store, canEdit } = await loadStorePageData(() => getStoreGeneralSettings(storeId));

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
        {!canEdit && <ReadOnlyNotice />}
        <StoreGeneralForm storeId={storeId} store={store} readOnly={!canEdit} />
      </section>
    </div>
  );
}

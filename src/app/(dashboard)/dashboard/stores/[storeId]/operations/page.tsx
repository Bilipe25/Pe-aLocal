import { PageHeader } from '@/components/shared/page-header';
import { ReadOnlyNotice } from '@/components/shared/read-only-notice';
import { StoreSettingsForm } from '@/features/stores/components/store-settings-form';
import { loadStorePageData } from '@/features/stores/page-access';
import { getStoreOperationalSettings } from '@/server/services/store-settings.service';

export const metadata = { title: 'Operações' };

export default async function StoreOperationsPage({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  const { store, canEdit } = await loadStorePageData(() => getStoreOperationalSettings(storeId));

  return (
    <div>
      <PageHeader
        title="Operações"
        description="Defina modalidades, pedido mínimo, prazo e formas de pagamento da unidade."
        backHref={`/dashboard/stores/${storeId}`}
      />
      <section
        className="border-border bg-surface max-w-3xl rounded-xl border p-4 sm:p-6"
        aria-label="Configurações operacionais"
      >
        {!canEdit && (
          <ReadOnlyNotice message="Seu perfil pode consultar a operação, mas somente o proprietário pode alterá-la." />
        )}
        <StoreSettingsForm
          storeId={storeId}
          expectedConfigurationVersion={store.configurationVersion}
          settings={store.settings}
          readOnly={!canEdit}
        />
      </section>
    </div>
  );
}

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
  const { store, canEdit, canViewPayments } = await loadStorePageData(() =>
    getStoreOperationalSettings(storeId),
  );

  return (
    <div>
      <PageHeader
        title="Operações"
        description="Defina modalidades, pedido mínimo e prazo; confira os pagamentos ativos."
        backHref={`/dashboard/stores/${storeId}`}
      />
      <section className="max-w-6xl" aria-label="Configurações operacionais">
        {!canEdit && (
          <ReadOnlyNotice message="Seu perfil pode consultar a operação, mas somente o proprietário pode alterá-la." />
        )}
        <StoreSettingsForm
          storeId={storeId}
          storeStatus={store.status}
          expectedConfigurationVersion={store.configurationVersion}
          settings={store.settings}
          hasActiveDeliveryZone={store.hasActiveDeliveryZone}
          paymentSummary={store.paymentSummary}
          paymentsHref={canViewPayments ? `/dashboard/stores/${storeId}/payments` : null}
          readOnly={!canEdit}
        />
      </section>
    </div>
  );
}

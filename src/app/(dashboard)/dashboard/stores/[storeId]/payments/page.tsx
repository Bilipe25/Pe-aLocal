import { PageHeader } from '@/components/shared/page-header';
import { PaymentSettingsForm } from '@/features/stores/components/payment-settings-form';
import { OnlinePaymentSettings } from '@/features/stores/components/online-payment-settings';
import { loadStorePageData } from '@/features/stores/page-access';
import { getStorePaymentSettings } from '@/server/services/store-settings.service';
import { getMercadoPagoCapability } from '@/server/services/mercado-pago-connection.service';

export const metadata = { title: 'Pagamentos' };

export default async function StorePaymentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ storeId: string }>;
  searchParams: Promise<{ connection?: string }>;
}) {
  const [{ storeId }, query] = await Promise.all([params, searchParams]);
  const [{ store, canEdit }, onlineCapability] = await Promise.all([
    loadStorePageData(() => getStorePaymentSettings(storeId)),
    getMercadoPagoCapability(storeId),
  ]);

  return (
    <div>
      <PageHeader
        title="Pagamentos"
        description="Defina as formas aceitas e mantenha os dados Pix desta unidade protegidos."
        backHref={`/dashboard/stores/${storeId}`}
      />
      <section className="max-w-5xl" aria-label="Configurações de pagamento">
        {onlineCapability ? (
          <OnlinePaymentSettings
            key={store.configurationVersion}
            storeId={storeId}
            expectedConfigurationVersion={store.configurationVersion}
            capability={onlineCapability}
            connectionFeedback={
              query.connection === 'connected' && onlineCapability.connection?.status === 'ACTIVE'
                ? 'connected'
                : query.connection === 'error' || query.connection === 'connected'
                  ? 'error'
                  : null
            }
            readOnly={!canEdit}
          />
        ) : null}
        <PaymentSettingsForm
          key={`manual-${store.configurationVersion}`}
          storeId={storeId}
          expectedConfigurationVersion={store.configurationVersion}
          settings={store.settings}
          readOnly={!canEdit}
        />
      </section>
    </div>
  );
}

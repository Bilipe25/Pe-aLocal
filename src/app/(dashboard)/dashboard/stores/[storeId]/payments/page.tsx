import { PageHeader } from '@/components/shared/page-header';
import { PixForm } from '@/features/stores/components/pix-form';
import { loadStorePageData } from '@/features/stores/page-access';
import { getStorePaymentSettings } from '@/server/services/store-settings.service';

export const metadata = { title: 'Pagamentos' };

export default async function StorePaymentsPage({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  const { store, canEdit } = await loadStorePageData(() => getStorePaymentSettings(storeId));

  return (
    <div>
      <PageHeader
        title="Pagamentos"
        description="Configure o pagamento por Pix desta unidade."
        backHref={`/dashboard/stores/${storeId}`}
      />
      <section
        className="border-border bg-surface max-w-3xl rounded-xl border p-4 sm:p-6"
        aria-label="Dados do Pix"
      >
        <PixForm
          storeId={storeId}
          expectedConfigurationVersion={store.configurationVersion}
          settings={store.settings}
          readOnly={!canEdit}
        />
      </section>
    </div>
  );
}

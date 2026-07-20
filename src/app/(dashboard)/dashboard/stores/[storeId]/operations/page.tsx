import { PageHeader } from '@/components/shared/page-header';
import { StoreSettingsForm } from '@/features/stores/components/store-settings-form';
import { getStoreForDashboard } from '@/features/stores/actions';

export const metadata = { title: 'Operações' };

export default async function StoreOperationsPage({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  const store = await getStoreForDashboard(storeId);

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
        <StoreSettingsForm storeId={storeId} settings={store.settings} />
      </section>
    </div>
  );
}

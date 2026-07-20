import { PageHeader } from '@/components/shared/page-header';
import { PixForm } from '@/features/stores/components/pix-form';
import { getStoreForDashboard } from '@/features/stores/actions';

export const metadata = { title: 'Pagamentos' };

export default async function StorePaymentsPage({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  const store = await getStoreForDashboard(storeId);

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
        <PixForm storeId={storeId} settings={store.settings} />
      </section>
    </div>
  );
}

import { PageHeader } from '@/components/shared/page-header';
import { HoursForm } from '@/features/stores/components/hours-form';
import { getStoreForDashboard } from '@/features/stores/actions';

export const metadata = { title: 'Horários de funcionamento' };

export default async function StoreHoursPage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  const store = await getStoreForDashboard(storeId);

  return (
    <div>
      <PageHeader
        title="Horários de funcionamento"
        description="Configure os dias e horários em que esta unidade aceita pedidos."
        backHref={`/dashboard/stores/${storeId}`}
      />
      <section
        className="border-border bg-surface max-w-4xl rounded-xl border p-4 sm:p-6"
        aria-label="Horários da loja"
      >
        <HoursForm storeId={storeId} hours={store.openingHours} />
      </section>
    </div>
  );
}

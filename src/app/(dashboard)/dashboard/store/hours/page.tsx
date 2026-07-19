import { PageHeader } from '@/components/shared/page-header';
import { getStoreForDashboard } from '@/features/stores/actions';
import { HoursForm } from '@/features/stores/components/hours-form';

export const metadata = { title: 'Horários de funcionamento' };

export default async function StoreHoursPage() {
  const store = await getStoreForDashboard();

  return (
    <div>
      <PageHeader
        title="Horários de funcionamento"
        description="Configure os dias e horários em que sua loja aceita pedidos."
        backHref="/dashboard/store"
      />
      <section className="max-w-4xl rounded-xl border border-border bg-surface p-4 sm:p-6" aria-label="Horários da loja">
          <HoursForm hours={store.openingHours} />
      </section>
    </div>
  );
}

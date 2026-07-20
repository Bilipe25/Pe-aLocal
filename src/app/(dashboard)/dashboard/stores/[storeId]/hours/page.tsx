import { PageHeader } from '@/components/shared/page-header';
import { HoursForm } from '@/features/stores/components/hours-form';
import { loadStorePageData } from '@/features/stores/page-access';
import { getStoreHoursSettings } from '@/server/services/store-settings.service';

export const metadata = { title: 'Horários de funcionamento' };

export default async function StoreHoursPage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  const { store, canEdit, canEditTimeZone } = await loadStorePageData(() =>
    getStoreHoursSettings(storeId),
  );

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
        {canEdit && (
          <HoursForm
            key={store.configurationVersion}
            storeId={storeId}
            expectedConfigurationVersion={store.configurationVersion}
            timeZone={store.timeZone}
            canEditTimeZone={canEditTimeZone}
            hours={store.openingHours}
            exceptions={store.scheduleExceptions.map((exception) => ({
              ...exception,
              date: exception.date.toISOString().slice(0, 10),
            }))}
          />
        )}
      </section>
    </div>
  );
}

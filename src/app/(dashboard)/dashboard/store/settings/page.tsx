import { PageHeader } from '@/components/shared/page-header';
import { getStoreForDashboard } from '@/features/stores/actions';
import { StoreSettingsForm } from '@/features/stores/components/store-settings-form';

export const metadata = { title: 'Entrega e retirada' };

export default async function StoreSettingsPage() {
  const store = await getStoreForDashboard();

  return (
    <div>
      <PageHeader
        title="Entrega e retirada"
        description="Defina as modalidades, o pedido mínimo, o prazo informado e as formas de pagamento."
        backHref="/dashboard/store"
      />
      <section className="max-w-3xl rounded-xl border border-border bg-surface p-4 sm:p-6" aria-label="Configurações de entrega e retirada">
          <StoreSettingsForm settings={store.settings} />
      </section>
    </div>
  );
}

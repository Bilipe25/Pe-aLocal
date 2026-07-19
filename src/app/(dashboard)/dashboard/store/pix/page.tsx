import { PageHeader } from '@/components/shared/page-header';
import { getStoreForDashboard } from '@/features/stores/actions';
import { PixForm } from '@/features/stores/components/pix-form';

export const metadata = { title: 'Pagamento por Pix' };

export default async function StorePixPage() {
  const store = await getStoreForDashboard();

  return (
    <div>
      <PageHeader
        title="Pagamento por Pix"
        description="Informe a chave exibida ao cliente e usada na conferência do pagamento."
        backHref="/dashboard/store"
      />
      <section className="max-w-3xl rounded-xl border border-border bg-surface p-4 sm:p-6" aria-label="Dados do Pix">
          <PixForm settings={store.settings} />
      </section>
    </div>
  );
}

import { PageHeader } from '@/components/shared/page-header';
import { getStoreForDashboard } from '@/features/stores/actions';
import { StoreGeneralForm } from '@/features/stores/components/store-general-form';

export const metadata = { title: 'Informações gerais' };

export default async function StoreGeneralPage() {
  const store = await getStoreForDashboard();

  return (
    <div>
      <PageHeader
        title="Informações gerais"
        description="Nome, endereço público, descrição e contatos da loja."
        backHref="/dashboard/store"
      />
      <section className="max-w-3xl rounded-xl border border-border bg-surface p-4 sm:p-6" aria-label="Dados da loja">
          <StoreGeneralForm store={store} />
      </section>
    </div>
  );
}

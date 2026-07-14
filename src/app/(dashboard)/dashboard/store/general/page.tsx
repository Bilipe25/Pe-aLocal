import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getStoreForDashboard } from '@/features/stores/actions';
import { StoreGeneralForm } from '@/features/stores/components/store-general-form';

export const metadata = { title: 'Informações Gerais' };

export default async function StoreGeneralPage() {
  const store = await getStoreForDashboard();

  return (
    <div>
      <PageHeader
        title="Informações Gerais"
        description="Nome, slug, descrição e contatos da loja."
        backHref="/dashboard/store"
      />
      <Card>
        <CardHeader>
          <CardTitle>Dados da Loja</CardTitle>
        </CardHeader>
        <CardContent>
          <StoreGeneralForm store={store} />
        </CardContent>
      </Card>
    </div>
  );
}

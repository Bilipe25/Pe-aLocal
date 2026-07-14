import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getStoreForDashboard } from '@/features/stores/actions';
import { PixForm } from '@/features/stores/components/pix-form';

export const metadata = { title: 'Configuração de Pix' };

export default async function StorePixPage() {
  const store = await getStoreForDashboard();

  return (
    <div>
      <PageHeader
        title="Configuração de Pix"
        description="Configure sua chave Pix para receber pagamentos."
        backHref="/dashboard/store"
      />
      <Card>
        <CardHeader>
          <CardTitle>Dados do Pix</CardTitle>
        </CardHeader>
        <CardContent>
          <PixForm settings={store.settings} />
        </CardContent>
      </Card>
    </div>
  );
}

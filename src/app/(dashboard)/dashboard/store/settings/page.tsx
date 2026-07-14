import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getStoreForDashboard } from '@/features/stores/actions';
import { StoreSettingsForm } from '@/features/stores/components/store-settings-form';

export const metadata = { title: 'Entrega e Retirada' };

export default async function StoreSettingsPage() {
  const store = await getStoreForDashboard();

  return (
    <div>
      <PageHeader
        title="Entrega e Retirada"
        description="Pedido mínimo, tempo estimado e formas de pagamento."
        backHref="/dashboard/store"
      />
      <Card>
        <CardHeader>
          <CardTitle>Configurações</CardTitle>
        </CardHeader>
        <CardContent>
          <StoreSettingsForm settings={store.settings} />
        </CardContent>
      </Card>
    </div>
  );
}

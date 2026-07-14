import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getStoreForDashboard } from '@/features/stores/actions';
import { HoursForm } from '@/features/stores/components/hours-form';

export const metadata = { title: 'Horários de Funcionamento' };

export default async function StoreHoursPage() {
  const store = await getStoreForDashboard();

  return (
    <div>
      <PageHeader
        title="Horários de Funcionamento"
        description="Configure os dias e horários em que sua loja aceita pedidos."
        backHref="/dashboard/store"
      />
      <Card>
        <CardHeader>
          <CardTitle>Horários</CardTitle>
        </CardHeader>
        <CardContent>
          <HoursForm hours={store.openingHours} />
        </CardContent>
      </Card>
    </div>
  );
}

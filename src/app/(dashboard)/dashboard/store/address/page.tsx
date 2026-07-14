import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getStoreForDashboard } from '@/features/stores/actions';
import { AddressForm } from '@/features/stores/components/address-form';

export const metadata = { title: 'Endereço' };

export default async function StoreAddressPage() {
  const store = await getStoreForDashboard();

  return (
    <div>
      <PageHeader
        title="Endereço"
        description="Endereço do seu estabelecimento."
        backHref="/dashboard/store"
      />
      <Card>
        <CardHeader>
          <CardTitle>Endereço</CardTitle>
        </CardHeader>
        <CardContent>
          <AddressForm address={store.address} />
        </CardContent>
      </Card>
    </div>
  );
}

import { PageHeader } from '@/components/shared/page-header';
import { DiningTablesManager } from '@/features/dining-tables/dining-tables-manager';
import { loadStorePageData } from '@/features/stores/page-access';
import { getDiningTablesPage } from '@/server/services/dining-table.service';
import { getSiteUrl } from '@/lib/storefront/urls';

export const metadata = { title: 'Mesas e QR Code' };

export default async function DiningTablesPage({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  const data = await loadStorePageData(() => getDiningTablesPage(storeId));
  return (
    <div>
      <PageHeader
        title="Mesas e QR Code"
        description="Crie um QR por mesa e mantenha o endereço público sob controle."
        backHref={`/dashboard/stores/${storeId}`}
      />
      <DiningTablesManager
        storeId={storeId}
        storeName={data.store.name}
        enabled={data.enabled}
        canManage={data.canManage}
        siteOrigin={getSiteUrl().origin}
        initialTables={data.tables.map((table) => ({
          id: table.id,
          label: table.label,
          sortOrder: table.sortOrder,
          publicToken: table.publicToken,
          isActive: table.isActive,
          version: table.version,
        }))}
      />
    </div>
  );
}

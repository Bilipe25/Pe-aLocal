import { requireTenantMember } from '@/server/auth';
import { getDb } from '@/server/database/client';
import { OrdersPanel } from '@/components/dashboard/orders-panel';

export const metadata = {
  title: 'Pedidos - Painel',
};

export default async function OrdersPage() {
  const session = await requireTenantMember();

  let storeId = session.storeId;

  if (!storeId) {
    const firstStore = await getDb().store.findFirst({
      where: { tenantId: session.tenantId },
      select: { id: true },
    });

    if (firstStore) {
      storeId = firstStore.id;
    } else {
      return (
        <div className="flex flex-col items-center justify-center p-12 text-center">
          <p className="text-text-secondary">Você precisa criar uma loja primeiro.</p>
        </div>
      );
    }
  }

  return <OrdersPanel storeId={storeId} />;
}

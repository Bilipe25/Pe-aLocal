import { DineInCheckout } from '@/components/storefront/dine-in-checkout';
import { DineInUnavailable } from '@/components/storefront/dine-in-unavailable';
import { StoreClosedBanner } from '@/components/storefront/store-closed-banner';
import { getDineInStorefrontContext } from '@/server/services/dine-in-storefront.service';

export const dynamic = 'force-dynamic';

export default async function DineInCheckoutPage({
  params,
}: {
  params: Promise<{ tableToken: string }>;
}) {
  const { tableToken } = await params;
  const context = await getDineInStorefrontContext(tableToken);
  if (context.state !== 'READY') {
    return <DineInUnavailable state={context.state} storeName={context.store?.name} />;
  }
  if (!context.store.availability.acceptingOrders) {
    return (
      <main className="dine-in-closed">
        <p className="dine-in-table-chip">Você está na {context.table.label}</p>
        <StoreClosedBanner availability={context.store.availability} />
      </main>
    );
  }
  return (
    <DineInCheckout
      tableToken={tableToken}
      tableLabel={context.table.label}
      storeSlug={context.store.slug}
      storeName={context.store.name}
      cartScopeId={context.cartScopeId}
      paymentMethods={context.paymentMethods}
    />
  );
}

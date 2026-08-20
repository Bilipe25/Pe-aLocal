import { Utensils } from 'lucide-react';
import { notFound } from 'next/navigation';

import { CustomerOrderTracking } from '@/components/storefront/customer-order-tracking';
import { OnlinePixPayment } from '@/components/storefront/online-pix-payment';
import { StorePurchaseHeader } from '@/components/storefront/store-purchase-header';
import { getPublicVapidKey } from '@/lib/web-push/config';
import { getStorefrontThemeStyle, storefrontLayoutClass } from '@/features/customization/theme';
import { privateCustomerOrderChannel } from '@/lib/pusher/customer-channel';
import { getOrderByPublicToken } from '@/server/repositories/order.repository';
import { getPublicStoreBySlug } from '@/server/queries/public-store';
import { toCustomerOrderTrackingState } from '@/server/services/customer-order-tracking.service';
import { getDineInStorefrontContext } from '@/server/services/dine-in-storefront.service';

export const dynamic = 'force-dynamic';

export default async function DineInOrderPage({
  params,
}: {
  params: Promise<{ tableToken: string; token: string }>;
}) {
  const { tableToken, token } = await params;
  const [context, order] = await Promise.all([
    getDineInStorefrontContext(tableToken),
    getOrderByPublicToken(token),
  ]);
  if (!order || order.modality !== 'DINE_IN') {
    notFound();
  }
  if (context.state === 'READY' && order.diningTableId !== context.table.id) notFound();
  const store = await getPublicStoreBySlug(order.store.slug);
  if (!store) notFound();

  const initialState = toCustomerOrderTrackingState({
    ...order,
    estimatedTimeMinMinutes: order.store.settings?.estimatedTimeMinMinutes ?? 30,
    estimatedTimeMaxMinutes: order.store.settings?.estimatedTimeMaxMinutes ?? 50,
  });
  const channelName = await privateCustomerOrderChannel(order.publicToken);

  const config = store.customization.config;
  return (
    <div
      className={`storefront-theme ${storefrontLayoutClass(config)} storefront-page-bottom-safe`}
      style={getStorefrontThemeStyle(config)}
    >
      <StorePurchaseHeader
        backHref={`/q/${tableToken}`}
        backLabel="Voltar ao cardápio"
        title={`Pedido #${order.orderNumber}`}
        storeName={store.name}
        logoImageUrl={store.customization.assets.logo?.url ?? store.logoUrl}
        logoImageAssetId={store.customization.assets.logo?.id ?? null}
      />
      <div className="dine-in-context-banner" role="status">
        <Utensils aria-hidden="true" />
        <span>Pedido para <strong>{order.diningTableLabelSnapshot}</strong></span>
      </div>
      <main className="storefront-tracking-main">
        <CustomerOrderTracking
          publicToken={order.publicToken}
          storeSlug={order.store.slug}
          channelName={channelName}
          timeZone={order.store.timeZone}
          initialState={initialState}
          publicVapidKey={getPublicVapidKey()}
          automaticPayment={order.payment?.provider === 'MERCADO_PAGO'}
        />
        {order.payment?.provider === 'MERCADO_PAGO' &&
        order.paymentStatus === 'PENDING' &&
        order.mercadoPagoPayment ? (
          <OnlinePixPayment
            storeSlug={order.store.slug}
            publicToken={order.publicToken}
            timeZone={order.store.timeZone}
            initialPayment={{
              creationStatus: order.mercadoPagoPayment.creationStatus,
              qrCode: order.mercadoPagoPayment.qrCode,
              ticketUrl: order.mercadoPagoPayment.ticketUrl,
              expiresAt: order.mercadoPagoPayment.expiresAt?.toISOString() ?? null,
            }}
          />
        ) : null}
      </main>
    </div>
  );
}

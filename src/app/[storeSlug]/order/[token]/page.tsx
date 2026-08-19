import { notFound, redirect } from 'next/navigation';
import { MapPin, Receipt } from 'lucide-react';
import {
  getOrderByPublicToken,
  isPublicOrderTokenExpired,
} from '@/server/repositories/order.repository';
import {
  getCanonicalPublicStoreSlug,
  getPublicPurchaseStoreBySlug,
} from '@/server/queries/public-store';
import { formatCurrency } from '@/lib/utils';
import { PixPaymentInfo } from '@/components/storefront/pix-payment-info';
import { OnlinePixPayment } from '@/components/storefront/online-pix-payment';
import { cache } from 'react';
import { CustomerOrderTracking } from '@/components/storefront/customer-order-tracking';
import {
  CustomerOrderAccessBoundary,
  ExpiredOrderAccess,
} from '@/components/storefront/customer-order-access-boundary';
import { StorePurchaseHeader } from '@/components/storefront/store-purchase-header';
import { StorefrontBottomNav } from '@/components/storefront/storefront-bottom-nav';
import { privateCustomerOrderChannel } from '@/lib/pusher/customer-channel';
import {
  getPublicPaymentStatusLabel,
  toCustomerOrderTrackingState,
} from '@/server/services/customer-order-tracking.service';
import { getPublicVapidKey } from '@/lib/web-push/config';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const getTrackedOrder = cache(getOrderByPublicToken);

interface OrderPageProps {
  params: Promise<{ storeSlug: string; token: string }>;
}

export async function generateMetadata({ params }: OrderPageProps) {
  const { storeSlug, token } = await params;
  const store = await getPublicPurchaseStoreBySlug(storeSlug);
  const order = await getTrackedOrder(token);

  if (!order || !store || order.store.slug !== storeSlug) {
    return {
      title: 'Pedido não encontrado',
      robots: { index: false, follow: false, nocache: true },
      referrer: 'no-referrer',
    };
  }

  return {
    title: `Pedido #${order.orderNumber} - ${store.name}`,
    robots: { index: false, follow: false, nocache: true },
    referrer: 'no-referrer',
  };
}

const modalityMap = {
  DELIVERY: 'Entrega',
  PICKUP: 'Retirada',
};

const paymentMap = {
  PIX: 'Pix',
  CASH: 'Dinheiro',
  CARD_ON_DELIVERY: 'Cartão no recebimento',
};

export default async function OrderPage({ params }: OrderPageProps) {
  const { storeSlug, token } = await params;
  const store = await getPublicPurchaseStoreBySlug(storeSlug);
  const order = await getTrackedOrder(token);

  if (!order || !store) {
    if (await isPublicOrderTokenExpired(token, storeSlug)) {
      return <ExpiredOrderAccess storeSlug={storeSlug} />;
    }
    notFound();
  }

  if (order.store.slug !== storeSlug) {
    const canonicalSlug = await getCanonicalPublicStoreSlug(storeSlug);
    if (canonicalSlug && canonicalSlug === order.store.slug) {
      redirect(`/${canonicalSlug}/order/${token}`);
    }
    notFound();
  }

  const initialTrackingState = toCustomerOrderTrackingState({
    ...order,
    estimatedTimeMinMinutes: order.store.settings?.estimatedTimeMinMinutes ?? 30,
    estimatedTimeMaxMinutes: order.store.settings?.estimatedTimeMaxMinutes ?? 50,
  });
  const trackingChannel = await privateCustomerOrderChannel(order.publicToken);

  return (
    <CustomerOrderAccessBoundary storeSlug={order.store.slug}>
      <div className="storefront-page-bottom-safe">
        <StorePurchaseHeader
          backHref={`/${order.store.slug}/orders`}
          backLabel="Voltar para meus pedidos"
          title={`Pedido #${order.orderNumber}`}
          storeName={store.name}
          logoImageUrl={store.customization.assets.logo?.url ?? store.logoUrl}
          logoImageAssetId={store.customization.assets.logo?.id ?? null}
        />

        <main className="storefront-tracking-main">
          <CustomerOrderTracking
            publicToken={order.publicToken}
            storeSlug={order.store.slug}
            channelName={trackingChannel}
            timeZone={order.store.timeZone}
            initialState={initialTrackingState}
            publicVapidKey={getPublicVapidKey()}
            automaticPayment={order.payment?.provider === 'MERCADO_PAGO'}
          />

          {order.payment?.provider === 'MERCADO_PAGO' &&
            order.paymentStatus === 'PENDING' &&
            order.mercadoPagoPayment && (
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
            )}

          {/* Pix Instructions */}
          {order.paymentMethod === 'PIX' &&
            order.payment?.provider === null &&
            ['PENDING', 'CUSTOMER_REPORTED_PAID'].includes(order.paymentStatus) && (
              <PixPaymentInfo
                pixKeyType={order.store.settings?.pixKeyType ?? null}
                pixKey={order.store.settings?.pixKey ?? null}
                pixRecipient={order.store.settings?.pixRecipient ?? null}
                pixBank={order.store.settings?.pixBank ?? null}
                pixInstructions={order.store.settings?.pixInstructions ?? null}
                total={order.total}
                orderNumber={order.orderNumber}
                storeWhatsapp={order.store.whatsapp}
                storeName={order.store.name}
                publicToken={order.publicToken}
                paymentStatus={order.paymentStatus}
              />
            )}

          {/* Resumo dos Itens */}
          <section className="storefront-tracking-card">
            <h3 className="storefront-tracking-card-title">Itens do pedido</h3>
            <div className="storefront-tracking-items">
              {order.items.map((item) => (
                <div key={item.id} className="storefront-tracking-item">
                  <div className="storefront-tracking-item-info">
                    <span className="storefront-tracking-item-name">
                      {item.quantity}x {item.productName}
                    </span>
                    {item.options.length > 0 && (
                      <p className="storefront-tracking-item-options">
                        {item.options.map((o) => o.optionName).join(', ')}
                      </p>
                    )}
                    {item.notes && (
                      <p className="storefront-tracking-item-notes">&quot;{item.notes}&quot;</p>
                    )}
                  </div>
                  <span className="storefront-tracking-item-price">
                    {formatCurrency(item.itemTotal)}
                  </span>
                </div>
              ))}
            </div>

            <div className="storefront-tracking-totals">
              <div className="storefront-tracking-total-row">
                <span>Subtotal</span>
                <span className="storefront-tracking-total-value">
                  {formatCurrency(order.subtotal)}
                </span>
              </div>
              {order.deliveryFee > 0 && (
                <div className="storefront-tracking-total-row">
                  <span>Taxa de entrega</span>
                  <span className="storefront-tracking-total-value">
                    {formatCurrency(order.deliveryFee)}
                  </span>
                </div>
              )}
              <div className="storefront-tracking-total-row is-grand-total">
                <span>Total</span>
                <span className="storefront-tracking-grand-total">
                  {formatCurrency(order.total)}
                </span>
              </div>
            </div>
          </section>

          {/* Informações de Entrega/Retirada e Pagamento */}
          <div className="storefront-tracking-info-grid">
            <div className="storefront-tracking-card">
              <div className="storefront-tracking-info-label">
                <MapPin aria-hidden="true" />
                <span>{modalityMap[order.modality]}</span>
              </div>
              <p className="storefront-tracking-info-value">
                {order.modality === 'DELIVERY' ? order.deliveryAddress : 'Na loja'}
              </p>
            </div>

            <div className="storefront-tracking-card">
              <div className="storefront-tracking-info-label">
                <Receipt aria-hidden="true" />
                <span>Pagamento</span>
              </div>
              <p className="storefront-tracking-info-value">{paymentMap[order.paymentMethod]}</p>
              <p className="storefront-tracking-info-detail">
                {getPublicPaymentStatusLabel({
                  paymentStatus: order.paymentStatus,
                  provider: order.payment?.provider ?? null,
                  cancellationReasonCode: order.cancellationReasonCode,
                })}
              </p>
              {order.paymentMethod === 'CASH' && order.changeFor && (
                <p className="storefront-tracking-info-detail">
                  Troco para {formatCurrency(order.changeFor)}
                </p>
              )}
            </div>
          </div>
        </main>

        <StorefrontBottomNav storeId={store.id} storeSlug={store.slug} />
      </div>
    </CustomerOrderAccessBoundary>
  );
}

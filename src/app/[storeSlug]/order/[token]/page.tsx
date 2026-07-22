import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  MapPin,
  Receipt,
  Clock,
  Package,
  CheckCircle2,
  type LucideIcon,
} from 'lucide-react';
import { getOrderByPublicToken } from '@/server/repositories/order.repository';
import { getCanonicalPublicStoreSlug } from '@/server/queries/public-store';
import { formatCurrency } from '@/lib/utils';
import { PixPaymentInfo } from '@/components/storefront/pix-payment-info';
import { cache } from 'react';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const getTrackedOrder = cache(getOrderByPublicToken);

interface OrderPageProps {
  params: Promise<{ storeSlug: string; token: string }>;
}

export async function generateMetadata({ params }: OrderPageProps) {
  const { storeSlug, token } = await params;
  const order = await getTrackedOrder(token);

  if (!order || order.store.slug !== storeSlug) {
    return {
      title: 'Pedido não encontrado',
      robots: { index: false, follow: false, nocache: true },
      referrer: 'no-referrer',
    };
  }

  return {
    title: `Pedido #${order.orderNumber} - ${order.store.name}`,
    robots: { index: false, follow: false, nocache: true },
    referrer: 'no-referrer',
  };
}

const statusMap: Record<string, { label: string; color: string; icon: LucideIcon }> = {
  PENDING: { label: 'Aguardando Loja', color: 'bg-kraft/50 text-tinta', icon: Clock },
  AWAITING_PAYMENT: {
    label: 'Aguardando Pagamento',
    color: 'bg-warning-light text-tinta',
    icon: Receipt,
  },
  CONFIRMED: { label: 'Confirmado', color: 'bg-info-light text-tinta', icon: CheckCircle2 },
  PREPARING: { label: 'Preparando', color: 'bg-info-light text-tinta', icon: Package },
  READY: {
    label: 'Pronto para Retirada',
    color: 'bg-success-light text-tinta',
    icon: CheckCircle2,
  },
  OUT_FOR_DELIVERY: {
    label: 'Saiu para Entrega',
    color: 'bg-info-light text-tinta',
    icon: Package,
  },
  DELIVERED: { label: 'Concluído', color: 'bg-success-light text-tinta', icon: CheckCircle2 },
  CANCELLED: { label: 'Cancelado', color: 'bg-error-light text-tinta', icon: ArrowLeft },
};

const modalityMap = {
  DELIVERY: 'Entrega',
  PICKUP: 'Retirada',
};

const paymentMap = {
  PIX: 'Pix',
  CASH: 'Dinheiro',
  CARD_ON_DELIVERY: 'Cartão na Entrega',
};

const paymentStatusMap = {
  PENDING: 'Pagamento pendente',
  CUSTOMER_REPORTED_PAID: 'Pagamento informado',
  PAID: 'Pagamento confirmado',
  FAILED: 'Pagamento não identificado',
  CANCELLED: 'Pagamento cancelado',
  REFUNDED: 'Pagamento reembolsado',
};

export default async function OrderPage({ params }: OrderPageProps) {
  const { storeSlug, token } = await params;
  const order = await getTrackedOrder(token);

  if (!order || order.store.slug !== storeSlug) {
    const canonicalSlug = order ? await getCanonicalPublicStoreSlug(storeSlug) : null;
    if (canonicalSlug && canonicalSlug === order?.store.slug) {
      redirect(`/${canonicalSlug}/order/${token}`);
    }
    notFound();
  }

  const statusInfo = statusMap[order.status] || statusMap.PENDING;
  const StatusIcon = statusInfo.icon;

  return (
    <div className="storefront-page-bottom-safe bg-papel min-h-screen">
      {/* Header */}
      <header className="border-tinta/10 bg-papel/80 sticky top-0 z-40 border-b px-4 py-3 backdrop-blur-md">
        <div className="mx-auto flex max-w-md items-center gap-3">
          <Link
            href={`/${order.store.slug}`}
            aria-label="Voltar para a loja"
            className="text-tinta hover:bg-tinta/5 flex min-h-11 min-w-11 items-center justify-center rounded-full transition-colors"
          >
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          </Link>
          <div className="flex-1">
            <h1 className="font-display text-tinta text-lg font-bold">Acompanhar Pedido</h1>
            <p className="text-text-muted text-sm break-words">{order.store.name}</p>
          </div>
        </div>
      </header>

      <main className="mx-auto mt-2 max-w-md space-y-6 p-4">
        {/* Banner de Status */}
        <div className="border-tinta/10 bg-papel rounded-xl border p-5 text-center shadow-sm">
          <div className="bg-tinta/5 mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full">
            <StatusIcon className="text-tinta h-6 w-6" />
          </div>
          <h2 className="font-display text-tinta text-2xl font-bold">#{order.orderNumber}</h2>
          <div
            className={`mt-2 inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${statusInfo.color}`}
          >
            {statusInfo.label}
          </div>
          <p className="text-text-muted mt-3 text-sm">
            Criado em{' '}
            {order.createdAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>

        {/* Pix Instructions */}
        {order.paymentMethod === 'PIX' &&
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
        <section className="border-tinta/10 bg-papel rounded-xl border p-4 shadow-sm">
          <h3 className="font-display text-tinta text-base font-bold">Itens do pedido</h3>
          <div className="mt-3 space-y-3">
            {order.items.map((item) => (
              <div
                key={item.id}
                className="border-tinta/5 flex items-start justify-between border-b pb-3 text-sm last:border-0 last:pb-0"
              >
                <div className="min-w-0 flex-1 pr-4">
                  <span className="text-tinta font-medium break-words">
                    {item.quantity}x {item.productName}
                  </span>
                  {item.options.length > 0 && (
                    <p className="text-text-muted mt-0.5 text-sm break-words">
                      {item.options.map((o) => o.optionName).join(', ')}
                    </p>
                  )}
                  {item.notes && (
                    <p className="text-text-muted mt-0.5 text-sm break-words italic">
                      &quot;{item.notes}&quot;
                    </p>
                  )}
                </div>
                <span className="text-tinta mt-0.5 shrink-0 font-mono text-sm font-bold">
                  {formatCurrency(item.itemTotal)}
                </span>
              </div>
            ))}
          </div>

          <div className="border-tinta/5 mt-4 space-y-1.5 border-t pt-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-text-muted">Subtotal</span>
              <span className="text-text-muted font-mono text-sm">
                {formatCurrency(order.subtotal)}
              </span>
            </div>
            {order.deliveryFee > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-text-muted">Taxa de entrega</span>
                <span className="text-text-muted font-mono text-sm">
                  {formatCurrency(order.deliveryFee)}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between pt-1.5 text-sm font-bold">
              <span className="text-tinta">Total</span>
              <span className="storefront-action-text font-mono text-base">
                {formatCurrency(order.total)}
              </span>
            </div>
          </div>
        </section>

        {/* Informações de Entrega/Retirada e Pagamento */}
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="border-tinta/10 bg-papel flex flex-col justify-between rounded-xl border p-3 shadow-sm">
            <div>
              <div className="text-text-muted mb-1 flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" />
                <span className="text-sm font-medium tracking-wider uppercase">
                  {modalityMap[order.modality]}
                </span>
              </div>
              <p className="text-tinta text-sm leading-tight font-medium break-words">
                {order.modality === 'DELIVERY' ? order.deliveryAddress : 'Na loja'}
              </p>
            </div>
          </div>

          <div className="border-tinta/10 bg-papel flex flex-col justify-between rounded-xl border p-3 shadow-sm">
            <div>
              <div className="text-text-muted mb-1 flex items-center gap-1.5">
                <Receipt className="h-3.5 w-3.5" />
                <span className="text-sm font-medium tracking-wider uppercase">Pagamento</span>
              </div>
              <p className="text-tinta text-sm leading-tight font-medium">
                {paymentMap[order.paymentMethod]}
              </p>
              <p className="text-text-muted mt-1 text-sm">
                {paymentStatusMap[order.paymentStatus]}
              </p>
              {order.paymentMethod === 'CASH' && order.changeFor && (
                <p className="text-text-muted mt-1 text-sm">
                  Troco para {formatCurrency(order.changeFor)}
                </p>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

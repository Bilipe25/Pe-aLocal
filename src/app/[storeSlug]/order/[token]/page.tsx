import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, MapPin, Receipt, Clock, Package, CheckCircle2, type LucideIcon } from 'lucide-react';
import { getOrderByPublicToken } from '@/server/repositories/order.repository';
import { formatCurrency } from '@/lib/utils';
import { PixPaymentInfo } from '@/components/storefront/pix-payment-info';

interface OrderPageProps {
  params: Promise<{ storeSlug: string; token: string }>;
}

export async function generateMetadata({ params }: OrderPageProps) {
  const { storeSlug, token } = await params;
  const order = await getOrderByPublicToken(token);

  if (!order || order.store.slug !== storeSlug) {
    return { title: 'Pedido não encontrado' };
  }

  return {
    title: `Pedido #${order.orderNumber} - ${order.store.name}`,
  };
}

const statusMap: Record<string, { label: string; color: string; icon: LucideIcon }> = {
  PENDING: { label: 'Aguardando Loja', color: 'bg-kraft/50 text-tinta', icon: Clock },
  AWAITING_PAYMENT: { label: 'Aguardando Pagamento', color: 'bg-warning-light text-tinta', icon: Receipt },
  CONFIRMED: { label: 'Confirmado', color: 'bg-info-light text-tinta', icon: CheckCircle2 },
  PREPARING: { label: 'Preparando', color: 'bg-info-light text-tinta', icon: Package },
  READY: { label: 'Pronto para Retirada', color: 'bg-success-light text-tinta', icon: CheckCircle2 },
  OUT_FOR_DELIVERY: { label: 'Saiu para Entrega', color: 'bg-info-light text-tinta', icon: Package },
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

export default async function OrderPage({ params }: OrderPageProps) {
  const { storeSlug, token } = await params;
  const order = await getOrderByPublicToken(token);

  if (!order || order.store.slug !== storeSlug) {
    notFound();
  }

  const statusInfo = statusMap[order.status] || statusMap.PENDING;
  const StatusIcon = statusInfo.icon;

  return (
    <div className="storefront-page-bottom-safe min-h-screen bg-papel">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-tinta/10 bg-papel/80 px-4 py-3 backdrop-blur-md">
        <div className="mx-auto flex max-w-md items-center gap-3">
          <Link
            href={`/${storeSlug}`}
            aria-label="Voltar para a loja"
            className="flex min-h-11 min-w-11 items-center justify-center rounded-full text-tinta transition-colors hover:bg-tinta/5"
          >
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          </Link>
          <div className="flex-1">
            <h1 className="font-display text-lg font-bold text-tinta">Acompanhar Pedido</h1>
            <p className="break-words text-sm text-text-muted">{order.store.name}</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-md p-4 space-y-6 mt-2">
        {/* Banner de Status */}
        <div className="rounded-xl border border-tinta/10 bg-papel p-5 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-tinta/5 mb-3">
            <StatusIcon className="h-6 w-6 text-tinta" />
          </div>
          <h2 className="font-display text-2xl font-bold text-tinta">#{order.orderNumber}</h2>
          <div className={`mt-2 inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${statusInfo.color}`}>
            {statusInfo.label}
          </div>
          <p className="mt-3 text-sm text-text-muted">
            Criado em {order.createdAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>

        {/* Pix Instructions */}
        {order.paymentMethod === 'PIX' && order.paymentStatus === 'PENDING' && (
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
          />
        )}

        {/* Resumo dos Itens */}
        <section className="rounded-xl border border-tinta/10 bg-papel p-4 shadow-sm">
          <h3 className="font-display text-base font-bold text-tinta">Itens do pedido</h3>
          <div className="mt-3 space-y-3">
            {order.items.map((item) => (
              <div key={item.id} className="flex items-start justify-between text-sm pb-3 border-b border-tinta/5 last:border-0 last:pb-0">
                <div className="flex-1 min-w-0 pr-4">
                  <span className="break-words font-medium text-tinta">
                    {item.quantity}x {item.productName}
                  </span>
                  {item.options.length > 0 && (
                    <p className="mt-0.5 break-words text-sm text-text-muted">
                      {item.options.map((o) => o.optionName).join(', ')}
                    </p>
                  )}
                  {item.notes && (
                    <p className="mt-0.5 break-words text-sm text-text-muted italic">&quot;{item.notes}&quot;</p>
                  )}
                </div>
                <span className="mt-0.5 shrink-0 font-mono text-sm font-bold text-tinta">
                  {formatCurrency(item.itemTotal)}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-4 space-y-1.5 border-t border-tinta/5 pt-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-text-muted">Subtotal</span>
              <span className="font-mono text-sm text-text-muted">{formatCurrency(order.subtotal)}</span>
            </div>
            {order.deliveryFee > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-text-muted">Taxa de entrega</span>
                <span className="font-mono text-sm text-text-muted">{formatCurrency(order.deliveryFee)}</span>
              </div>
            )}
            <div className="flex items-center justify-between text-sm font-bold pt-1.5">
              <span className="text-tinta">Total</span>
              <span className="storefront-action-text font-mono text-base">{formatCurrency(order.total)}</span>
            </div>
          </div>
        </section>

        {/* Informações de Entrega/Retirada e Pagamento */}
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-tinta/10 bg-papel p-3 shadow-sm flex flex-col justify-between">
            <div>
              <div className="mb-1 flex items-center gap-1.5 text-text-muted">
                <MapPin className="h-3.5 w-3.5" />
                <span className="text-sm font-medium uppercase tracking-wider">{modalityMap[order.modality]}</span>
              </div>
              <p className="break-words text-sm font-medium leading-tight text-tinta">
                {order.modality === 'DELIVERY' ? order.deliveryAddress : 'Na loja'}
              </p>
            </div>
          </div>
          
          <div className="rounded-xl border border-tinta/10 bg-papel p-3 shadow-sm flex flex-col justify-between">
            <div>
              <div className="mb-1 flex items-center gap-1.5 text-text-muted">
                <Receipt className="h-3.5 w-3.5" />
                <span className="text-sm font-medium uppercase tracking-wider">Pagamento</span>
              </div>
              <p className="text-sm text-tinta font-medium leading-tight">
                {paymentMap[order.paymentMethod]}
              </p>
              {order.paymentMethod === 'CASH' && order.changeFor && (
                <p className="mt-1 text-sm text-text-muted">
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

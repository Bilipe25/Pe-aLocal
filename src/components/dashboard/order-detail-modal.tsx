'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { useState } from 'react';
import {
  AlertTriangle,
  Clock3,
  ExternalLink,
  History,
  MapPin,
  MessageCircle,
  Phone,
  Printer,
  Receipt,
  Timer,
  User,
  X,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useOrderDetails, useOrderHistory } from '@/hooks/use-orders';
import { normalizePhone } from '@/lib/brazil';
import { cn, formatCurrency } from '@/lib/utils';
import type { OrderStatus } from '@prisma/client';
import type { OrderDetailsDTO, OrderHistoryItemDTO } from '@/types/order-query';
import { paymentStatusMap, statusMap } from './order-card';
import { StatusActions } from './status-actions';
import { InternalOrderNotes } from './internal-order-notes';

interface OrderDetailModalProps {
  orderId: string | null;
  storeId: string;
  authorizationScope: string;
  timeZone: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOrderChanged?: (orderId: string) => void;
}

type OperationalOrderDetails = OrderDetailsDTO;

function formatDate(value: string, timeZone: string, compact = false) {
  const options: Intl.DateTimeFormatOptions = compact
    ? { timeZone, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }
    : { timeZone, dateStyle: 'short', timeStyle: 'short' };
  return new Intl.DateTimeFormat('pt-BR', options).format(new Date(value));
}

function HistoryList({ entries, timeZone }: { entries: OrderHistoryItemDTO[]; timeZone: string }) {
  const sourceLabels: Record<OrderHistoryItemDTO['source'], string> = {
    CUSTOMER: 'Cliente',
    DASHBOARD: 'Painel',
    SYSTEM: 'Sistema',
    WEBHOOK: 'Webhook',
    SUPPORT: 'Suporte',
    QUEUE: 'Fila',
  };
  return (
    <ol className="space-y-3 text-sm">
      {entries.map((entry) => (
        <li key={entry.id} className="border-border border-b pb-3 last:border-0">
          <div className="flex items-start justify-between gap-3">
            <span className="text-text-primary min-w-0">
              <span className="block font-medium">
                {entry.isUndo
                  ? `Desfeito para ${statusMap[entry.toStatus].label}`
                  : entry.fromStatus
                    ? `${statusMap[entry.fromStatus].label} → ${statusMap[entry.toStatus].label}`
                    : statusMap[entry.toStatus].label}
              </span>
              <span className="text-text-secondary mt-0.5 block text-xs">
                {entry.actorName} · {sourceLabels[entry.source]}
                {entry.versionTo !== null ? ` · versão ${entry.versionTo}` : ''}
              </span>
            </span>
            <time className="text-text-secondary shrink-0 text-xs" dateTime={entry.createdAt}>
              {formatDate(entry.createdAt, timeZone, true)}
            </time>
          </div>
          {entry.reasonCode && (
            <p className="text-text-secondary mt-2 text-xs font-medium">
              Motivo: {entry.reasonCode.replaceAll('_', ' ')}
            </p>
          )}
          {entry.note && (
            <p className="text-text-secondary mt-1 text-xs break-words whitespace-pre-wrap">
              {entry.note}
            </p>
          )}
        </li>
      ))}
    </ol>
  );
}

function durationLabel(minutes: number | null) {
  if (minutes === null) return '—';
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}min`;
}

function formatItemOptions(options: OrderDetailsDTO['items'][number]['options']) {
  const groups: Array<{ name: string | null; options: string[] }> = [];
  for (const option of options) {
    const previous = groups.at(-1);
    if (option.groupName && previous?.name === option.groupName) {
      previous.options.push(option.name);
    } else {
      groups.push({ name: option.groupName, options: [option.name] });
    }
  }
  return groups
    .map((group) =>
      group.name ? `${group.name}: ${group.options.join(', ')}` : group.options.join(', '),
    )
    .join(' · ');
}

function promisedWindowLabel(order: OperationalOrderDetails, timeZone: string) {
  if (!order.promisedFulfillmentMinAt || !order.promisedFulfillmentMaxAt) return null;
  const minAt = new Date(order.promisedFulfillmentMinAt);
  const maxAt = new Date(order.promisedFulfillmentMaxAt);
  if (Number.isNaN(minAt.getTime()) || Number.isNaN(maxAt.getTime())) return null;
  const formatter = new Intl.DateTimeFormat('pt-BR', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${formatter.format(minAt)}–${formatter.format(maxAt)}`;
}

export function formatDeliveryAddressForOperations(delivery: OperationalOrderDetails['delivery']) {
  const legacyAddress = delivery.address?.trim();
  if (legacyAddress) return legacyAddress;

  const streetLine = [delivery.street?.trim(), delivery.number?.trim()].filter(Boolean).join(', ');
  const region = delivery.neighborhood?.trim() || delivery.zoneName?.trim();
  const cityState = [delivery.city?.trim(), delivery.state?.trim()].filter(Boolean).join(' - ');
  const postalCode = delivery.postalCode?.trim();
  const segments = [streetLine, region, cityState, postalCode].filter(Boolean);
  return segments.length ? segments.join(' · ') : null;
}

function getStatusTimeline(order: OperationalOrderDetails) {
  const candidates: Array<{ status: OrderStatus; occurredAt: string | null }> = [
    { status: 'PENDING', occurredAt: order.createdAt },
    { status: 'CONFIRMED', occurredAt: order.acceptedAt },
    { status: 'PREPARING', occurredAt: order.preparingAt },
    { status: 'READY', occurredAt: order.readyAt },
    { status: 'OUT_FOR_DELIVERY', occurredAt: order.dispatchedAt },
    { status: 'DELIVERED', occurredAt: order.deliveredAt },
    { status: 'CANCELLED', occurredAt: order.cancelledAt },
  ];
  const timeline = candidates.filter(
    (entry): entry is { status: OrderStatus; occurredAt: string } => Boolean(entry.occurredAt),
  );
  if (!timeline.some((item) => item.status === order.status)) {
    timeline.push({ status: order.status, occurredAt: order.statusChangedAt });
  }
  return timeline.sort(
    (left, right) => new Date(left.occurredAt).getTime() - new Date(right.occurredAt).getTime(),
  );
}

function OrderStatusTimeline({
  order,
  timeZone,
}: {
  order: OperationalOrderDetails;
  timeZone: string;
}) {
  const entries = getStatusTimeline(order);
  return (
    <ol className="mt-4 grid gap-0" aria-label="Linha do tempo do pedido">
      {entries.map((entry, index) => {
        const current = entry.status === order.status;
        return (
          <li
            key={`${entry.status}-${entry.occurredAt}`}
            className="relative grid grid-cols-[1rem_1fr] gap-3 pb-3 last:pb-0"
          >
            <span
              aria-hidden="true"
              className={cn(
                'relative z-10 mt-1 h-3 w-3 rounded-full border-2',
                current ? 'border-brand-600 bg-brand-600' : 'border-success bg-surface',
              )}
            />
            {index < entries.length - 1 ? (
              <span
                aria-hidden="true"
                className="bg-border absolute top-4 bottom-0 left-[0.34375rem] w-px"
              />
            ) : null}
            <span className="flex min-w-0 items-start justify-between gap-3 text-sm">
              <span
                className={
                  current ? 'text-brand-700 font-semibold' : 'text-text-primary font-medium'
                }
              >
                {statusMap[entry.status].label}
              </span>
              <time className="text-text-secondary shrink-0" dateTime={entry.occurredAt}>
                {formatDate(entry.occurredAt, timeZone, true)}
              </time>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

const paymentHistoryLabels: Record<string, string> = {
  INITIAL_PENDING: 'Pagamento criado',
  PENDING_CUSTOMER_REPORTED_PAID: 'Pagamento informado pelo cliente',
  PENDING_PAID: 'Pagamento confirmado',
  CUSTOMER_REPORTED_PAID_PAID: 'Pagamento confirmado',
  CUSTOMER_REPORTED_PAID_FAILED: 'Pagamento não identificado',
  FAILED_PENDING: 'Pagamento reaberto para análise',
  PENDING_CANCELLED: 'Pagamento cancelado',
  CUSTOMER_REPORTED_PAID_CANCELLED: 'Pagamento cancelado',
  FAILED_CANCELLED: 'Pagamento cancelado',
  PAID_REFUNDED: 'Pagamento reembolsado',
};

function DetailsSkeleton({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="flex min-h-96 flex-col"
      role="status"
      aria-label="Carregando detalhes do pedido"
    >
      <div className="border-border flex items-start justify-between gap-4 border-b p-4">
        <div>
          <Dialog.Title className="sr-only">Carregando pedido</Dialog.Title>
          <Dialog.Description className="sr-only">
            Aguarde os detalhes do pedido.
          </Dialog.Description>
          <div className="bg-surface-tertiary h-6 w-40 animate-pulse rounded" />
          <div className="bg-surface-tertiary mt-2 h-4 w-56 animate-pulse rounded" />
        </div>
        <Button variant="ghost" size="icon" aria-label="Fechar detalhes" onClick={onClose}>
          <X aria-hidden="true" />
        </Button>
      </div>
      <div className="grid flex-1 gap-4 p-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="bg-surface-tertiary h-28 animate-pulse rounded-xl" />
        ))}
      </div>
    </div>
  );
}

function OrderDetails({
  order,
  storeId,
  authorizationScope,
  timeZone,
  onClose,
  onOrderChanged,
}: {
  order: OperationalOrderDetails;
  storeId: string;
  authorizationScope: string;
  timeZone: string;
  onClose: () => void;
  onOrderChanged?: (orderId: string) => void;
}) {
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const historyQuery = useOrderHistory(storeId, authorizationScope, order.id, historyExpanded);
  const fullHistory = historyQuery.data?.pages.flatMap((page) => page.items) ?? null;
  const displayedHistory = fullHistory ?? order.recentHistory.slice(0, 4);
  const paymentInfo = paymentStatusMap[order.payment.status];
  const promisedWindow = promisedWindowLabel(order, timeZone);
  const normalizedPhone = order.customer.phone ? normalizePhone(order.customer.phone) : null;
  const deliveryAddress = formatDeliveryAddressForOperations(order.delivery);
  const mapUrl = deliveryAddress
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(deliveryAddress)}`
    : null;

  async function loadHistory() {
    if (!historyExpanded) {
      setHistoryExpanded(true);
    } else if (historyQuery.hasNextPage) {
      await historyQuery.fetchNextPage();
    } else {
      await historyQuery.refetch();
    }
  }

  return (
    <>
      <style>{`@media print {
        body * { visibility: hidden !important; }
        [data-order-print-root], [data-order-print-root] * { visibility: visible !important; }
        [data-order-print-root] { position: absolute !important; inset: 0 !important; width: 100% !important; max-height: none !important; overflow: visible !important; border: 0 !important; box-shadow: none !important; }
        [data-order-print-scroll] { overflow: visible !important; }
        [data-order-print-hide] { display: none !important; }
      }`}</style>
      <header className="border-border bg-surface sticky top-0 z-10 flex shrink-0 items-start justify-between gap-4 border-b p-4 print:static">
        <div>
          <Dialog.Title className="text-text-primary text-xl font-bold">
            Pedido #{order.orderNumber}
          </Dialog.Title>
          <Dialog.Description className="text-text-secondary mt-1 text-sm">
            Recebido em {formatDate(order.createdAt, timeZone)}
          </Dialog.Description>
          <p className="text-text-secondary mt-1 text-xs">
            Versão {order.version}
            {order.lastChangedBy ? ` · última alteração por ${order.lastChangedBy}` : ''}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1" data-order-print-hide>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Imprimir pedido ${order.orderNumber}`}
            onClick={() => window.print()}
          >
            <Printer aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Fechar pedido ${order.orderNumber}`}
            onClick={onClose}
          >
            <X aria-hidden="true" />
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 print:overflow-visible" data-order-print-scroll>
        <section
          className="border-border mb-6 border-b pb-5"
          aria-label="Tempo operacional do pedido"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-text-primary flex items-center gap-2 text-sm font-semibold">
                <Clock3 aria-hidden="true" /> {order.operational.stageLabel}
              </p>
              <p className="text-text-secondary mt-1 text-sm">
                Nesta etapa há {durationLabel(order.operational.elapsedMinutes)}
              </p>
            </div>
            {order.operational.alerts.map((alert) => (
              <span
                key={alert.code}
                className={
                  alert.severity === 'critical'
                    ? 'bg-error-light text-error inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-semibold'
                    : 'bg-warning-light text-warning inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-semibold'
                }
              >
                <AlertTriangle aria-hidden="true" /> {alert.label}
              </span>
            ))}
          </div>
          <OrderStatusTimeline order={order} timeZone={timeZone} />
          <dl className="border-border mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t pt-4 text-sm">
            {[
              ['Aceite', order.operational.durations.acceptanceMinutes],
              ['Preparo', order.operational.durations.preparationMinutes],
              ['Pronto', order.operational.durations.readyMinutes],
              ['Entrega', order.operational.durations.deliveryMinutes],
              ['Total', order.operational.durations.totalMinutes],
            ].map(([label, value]) => (
              <div key={label as string}>
                <dt className="text-text-secondary">{label}</dt>
                <dd className="text-text-primary mt-0.5 flex items-center gap-1 font-mono font-bold">
                  <Timer aria-hidden="true" /> {durationLabel(value as number | null)}
                </dd>
              </div>
            ))}
          </dl>
          {promisedWindow ? (
            <div className="bg-info-light mt-4 flex items-start gap-2 rounded-lg px-3 py-2.5">
              <Clock3 className="text-info mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <div>
                <p className="text-text-primary text-sm font-semibold">Previsão de conclusão</p>
                <p className="text-text-secondary mt-0.5 text-sm">{promisedWindow}</p>
              </div>
            </div>
          ) : null}
        </section>
        <div className="space-y-6">
          <div className="space-y-6">
            <section aria-labelledby={`customer-heading-${order.id}`}>
              <h3
                id={`customer-heading-${order.id}`}
                className="text-text-primary mb-3 text-sm font-semibold"
              >
                Cliente
              </h3>
              <div className="bg-surface-secondary space-y-3 rounded-lg p-3 text-sm">
                <div className="flex items-center gap-2">
                  <User className="text-text-muted" aria-hidden="true" />
                  <span className="text-text-primary font-medium">{order.customer.name}</span>
                </div>
                {order.customer.phone && normalizedPhone ? (
                  <div>
                    <p className="text-text-secondary flex min-h-6 items-center gap-2">
                      <Phone className="text-text-muted" aria-hidden="true" />
                      {order.customer.phone}
                    </p>
                    <div className="mt-2 grid grid-cols-2 gap-2" data-order-print-hide>
                      <Button asChild variant="outline" size="sm">
                        <a
                          href={`tel:+${normalizedPhone}`}
                          aria-label={`Ligar para ${order.customer.name}`}
                        >
                          <Phone aria-hidden="true" /> Ligar
                        </a>
                      </Button>
                      <Button asChild variant="outline" size="sm">
                        <a
                          href={`https://wa.me/${normalizedPhone}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`Conversar com ${order.customer.name} no WhatsApp`}
                        >
                          <MessageCircle aria-hidden="true" /> WhatsApp
                        </a>
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="text-text-secondary flex min-h-11 items-center gap-2">
                    <Phone className="text-text-muted" aria-hidden="true" />
                    <span>Contato protegido</span>
                  </div>
                )}
              </div>
            </section>

            <section aria-labelledby={`fulfillment-heading-${order.id}`}>
              <h3
                id={`fulfillment-heading-${order.id}`}
                className="text-text-primary mb-3 text-sm font-semibold"
              >
                Entrega e pagamento
              </h3>
              <div className="bg-surface-secondary space-y-3 rounded-lg p-3 text-sm">
                <div>
                  <div className="text-text-secondary mb-1 flex items-center gap-2">
                    <MapPin aria-hidden="true" />
                    <span>{order.modality === 'DELIVERY' ? 'Entrega' : 'Retirada'}</span>
                  </div>
                  {order.modality === 'DELIVERY' && (
                    <div className="pl-6">
                      <p className="text-text-primary font-medium break-words">
                        {deliveryAddress ?? 'Endereço protegido'}
                      </p>
                      {mapUrl ? (
                        <Button
                          asChild
                          variant="outline"
                          size="sm"
                          className="mt-2 w-full"
                          data-order-print-hide
                        >
                          <a
                            href={mapUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`Abrir endereço do pedido ${order.orderNumber} no mapa`}
                          >
                            <MapPin aria-hidden="true" /> Abrir no mapa
                            <ExternalLink aria-hidden="true" />
                          </a>
                        </Button>
                      ) : null}
                    </div>
                  )}
                </div>
                <div className="border-border border-t pt-3">
                  <div className="text-text-secondary mb-1 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Receipt aria-hidden="true" />
                      <span>
                        {order.payment.method === 'PIX'
                          ? 'Pix'
                          : order.payment.method === 'CASH'
                            ? 'Dinheiro'
                            : 'Cartão'}
                      </span>
                    </div>
                    <span
                      className={`rounded-full px-2 py-0.5 text-sm font-medium ${paymentInfo.color}`}
                    >
                      {paymentInfo.label}
                    </span>
                  </div>
                  {order.payment.method === 'CASH' && order.payment.changeFor && (
                    <p className="text-text-primary pl-6">
                      Troco para {formatCurrency(order.payment.changeFor)}
                    </p>
                  )}
                  {order.payment.paidAt && (
                    <p className="text-text-secondary pl-6 text-xs">
                      Confirmado em {formatDate(order.payment.paidAt, timeZone, true)}
                    </p>
                  )}
                  {order.payment.refundAmount !== null && (
                    <p className="text-text-secondary pl-6 text-xs">
                      Reembolso integral: {formatCurrency(order.payment.refundAmount)}
                    </p>
                  )}
                </div>
                {order.recentPaymentHistory.length > 0 && (
                  <ol className="border-border space-y-2 border-t pt-3 text-xs">
                    {order.recentPaymentHistory.map((entry) => (
                      <li key={entry.id} className="flex items-start justify-between gap-3">
                        <span>
                          <span className="text-text-primary block">
                            {paymentHistoryLabels[entry.action] ?? 'Pagamento atualizado'}
                          </span>
                          <span className="text-text-secondary">{entry.actorName}</span>
                          {entry.note && (
                            <span className="text-text-secondary mt-0.5 block whitespace-pre-wrap">
                              {entry.note}
                            </span>
                          )}
                        </span>
                        <time className="text-text-secondary shrink-0" dateTime={entry.createdAt}>
                          {formatDate(entry.createdAt, timeZone, true)}
                        </time>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </section>

            {order.customerNotes && (
              <section aria-labelledby={`notes-heading-${order.id}`}>
                <h3
                  id={`notes-heading-${order.id}`}
                  className="text-text-primary mb-2 text-sm font-semibold"
                >
                  Observação do cliente
                </h3>
                <p className="bg-warning-light text-text-primary rounded-lg p-3 text-sm break-words whitespace-pre-wrap">
                  {order.customerNotes}
                </p>
              </section>
            )}
          </div>

          <div className="space-y-6">
            <section aria-labelledby={`items-heading-${order.id}`}>
              <h3
                id={`items-heading-${order.id}`}
                className="text-text-primary mb-3 text-sm font-semibold"
              >
                Itens ({order.items.length})
              </h3>
              <div className="bg-surface-secondary rounded-lg p-3">
                <div className="space-y-3">
                  {order.items.map((item) => (
                    <div
                      key={item.id}
                      className="border-border border-b pb-3 last:border-0 last:pb-0"
                    >
                      <div className="flex justify-between gap-3 text-sm">
                        <span className="text-text-primary min-w-0 font-medium break-words">
                          {item.quantity}× {item.productName}
                        </span>
                        <span className="text-text-primary shrink-0 font-mono">
                          {formatCurrency(item.itemTotal)}
                        </span>
                      </div>
                      {item.options.length > 0 && (
                        <p className="text-text-secondary mt-1 pl-4 text-sm break-words">
                          {formatItemOptions(item.options)}
                        </p>
                      )}
                      {item.notes && (
                        <p className="text-text-secondary mt-1 pl-4 text-sm break-words whitespace-pre-wrap italic">
                          “{item.notes}”
                        </p>
                      )}
                    </div>
                  ))}
                </div>
                <div className="border-border mt-4 space-y-1.5 border-t pt-3 text-sm">
                  <div className="text-text-secondary flex justify-between">
                    <span>Subtotal</span>
                    <span>{formatCurrency(order.totals.subtotal)}</span>
                  </div>
                  {order.totals.discount > 0 && (
                    <div className="text-text-secondary flex justify-between">
                      <span>Desconto</span>
                      <span>-{formatCurrency(order.totals.discount)}</span>
                    </div>
                  )}
                  {order.totals.deliveryFee > 0 && (
                    <div className="text-text-secondary flex justify-between">
                      <span>Taxa de entrega</span>
                      <span>{formatCurrency(order.totals.deliveryFee)}</span>
                    </div>
                  )}
                  <div className="text-text-primary flex justify-between pt-1.5 font-bold">
                    <span>Total</span>
                    <span className="text-brand-700 font-mono text-base">
                      {formatCurrency(order.totals.total)}
                    </span>
                  </div>
                </div>
              </div>
            </section>

            <InternalOrderNotes
              order={order}
              storeId={storeId}
              authorizationScope={authorizationScope}
              timeZone={timeZone}
              onOrderChanged={onOrderChanged}
            />

            {displayedHistory.length > 0 && (
              <section aria-labelledby={`history-heading-${order.id}`}>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3
                    id={`history-heading-${order.id}`}
                    className="text-text-primary flex items-center gap-2 text-sm font-semibold"
                  >
                    <History aria-hidden="true" /> Histórico
                  </h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={loadHistory}
                    disabled={historyQuery.isFetching}
                  >
                    {historyQuery.isFetching
                      ? 'Carregando…'
                      : fullHistory && historyQuery.hasNextPage
                        ? 'Carregar mais'
                        : fullHistory
                          ? 'Atualizado'
                          : 'Ver completo'}
                  </Button>
                </div>
                {historyQuery.error && (
                  <p
                    className="bg-error-light text-error mb-3 rounded-lg px-3 py-2 text-xs"
                    role="status"
                  >
                    Não foi possível atualizar o histórico. Tente novamente.
                  </p>
                )}
                <HistoryList entries={displayedHistory} timeZone={timeZone} />
              </section>
            )}
          </div>
        </div>
      </div>

      <footer
        className="border-border bg-surface sticky bottom-0 z-10 shrink-0 border-t p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] sm:p-4 print:hidden"
        data-order-print-hide
      >
        <StatusActions
          order={order}
          storeId={storeId}
          authorizationScope={authorizationScope}
          onOrderChanged={(changedOrderId) => {
            onOrderChanged?.(changedOrderId);
            onClose();
          }}
        />
      </footer>
    </>
  );
}

export function OrderDetailModal({
  orderId,
  storeId,
  authorizationScope,
  timeZone,
  open,
  onOpenChange,
  onOrderChanged,
}: OrderDetailModalProps) {
  const detailsQuery = useOrderDetails(storeId, authorizationScope, orderId);

  if (!orderId) return null;

  const content = detailsQuery.isLoading ? (
    <DetailsSkeleton onClose={() => onOpenChange(false)} />
  ) : detailsQuery.error || !detailsQuery.data ? (
    <div className="p-5">
      <Dialog.Title className="text-text-primary text-lg font-semibold">
        Detalhes do pedido
      </Dialog.Title>
      <Dialog.Description className="text-text-secondary mt-1 text-sm">
        Não foi possível carregar este pedido.
      </Dialog.Description>
      <p className="text-error text-sm">Não foi possível carregar os detalhes atualizados.</p>
      <div className="mt-4 flex gap-2">
        <Button variant="outline" onClick={() => detailsQuery.refetch()}>
          Tentar novamente
        </Button>
        <Button variant="ghost" onClick={() => onOpenChange(false)}>
          Fechar
        </Button>
      </div>
    </div>
  ) : (
    <OrderDetails
      order={detailsQuery.data}
      storeId={storeId}
      authorizationScope={authorizationScope}
      timeZone={timeZone}
      onClose={() => onOpenChange(false)}
      onOrderChanged={onOrderChanged}
    />
  );

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="order-details-overlay fixed inset-0 z-40" />
        <Dialog.Content
          id="order-details-panel"
          className="order-details-drawer bg-surface fixed z-50 flex flex-col overflow-hidden focus:outline-none print:static print:max-h-none print:overflow-visible print:shadow-none"
          data-order-print-root
        >
          {content}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

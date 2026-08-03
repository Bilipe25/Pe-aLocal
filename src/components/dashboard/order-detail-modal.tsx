'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  Clock3,
  ExternalLink,
  History,
  MapPin,
  MessageCircle,
  Phone,
  Printer,
  Receipt,
  ShoppingBag,
  Timer,
  User,
  X,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  formatElapsedMinutes,
  formatOperationalDuration,
  formatPromisedFulfillment,
} from '@/domain/orders/order-time';
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
  const currentStatus = statusMap[order.status];
  const CurrentStatusIcon = currentStatus.icon;
  const paymentInfo = paymentStatusMap[order.payment.status];
  const stageStartedAtMs = new Date(order.operational.stageStartedAt).getTime();
  const snapshotNow = Number.isFinite(stageStartedAtMs)
    ? stageStartedAtMs + order.operational.elapsedMinutes * 60_000
    : new Date(order.createdAt).getTime();
  const promisedWindow = formatPromisedFulfillment(
    order.promisedFulfillmentMinAt,
    order.promisedFulfillmentMaxAt,
    timeZone,
    snapshotNow,
    order.status !== 'DELIVERED' && order.status !== 'CANCELLED',
  );
  const normalizedPhone = order.customer.phone ? normalizePhone(order.customer.phone) : null;
  const deliveryAddress = formatDeliveryAddressForOperations(order.delivery);
  const mapUrl = deliveryAddress
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(deliveryAddress)}`
    : null;

  function toggleHistory() {
    setHistoryExpanded((current) => !current);
  }

  async function loadMoreHistory() {
    if (historyQuery.hasNextPage) {
      await historyQuery.fetchNextPage();
      return;
    }
    await historyQuery.refetch();
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
      <header className="order-detail-header border-border bg-surface sticky top-0 z-10 flex shrink-0 items-start justify-between gap-3 border-b p-3 sm:p-4 print:static">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Dialog.Title className="text-text-primary text-lg font-bold sm:text-xl">
              Pedido #{order.orderNumber}
            </Dialog.Title>
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${currentStatus.color}`}
            >
              <CurrentStatusIcon className="h-3.5 w-3.5" aria-hidden="true" />
              {currentStatus.label}
            </span>
          </div>
          <Dialog.Description className="text-text-secondary mt-0.5 text-xs sm:text-sm">
            Recebido em {formatDate(order.createdAt, timeZone)}
          </Dialog.Description>
        </div>
        <div className="flex shrink-0 items-center gap-0.5" data-order-print-hide>
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

      <div
        className="order-detail-scroll flex-1 overflow-y-auto px-3 py-3 sm:p-4 print:overflow-visible"
        data-order-print-scroll
      >
        <div className="space-y-4">
          {order.operational.alerts.length > 0 ? (
            <section className="space-y-2" aria-label="Alertas operacionais do pedido">
              {order.operational.alerts.map((alert) => (
                <div
                  key={alert.code}
                  className={cn(
                    'flex items-start gap-2 rounded-lg px-3 py-2 text-sm font-semibold',
                    alert.severity === 'critical'
                      ? 'bg-error-light text-error'
                      : 'bg-warning-light text-warning',
                  )}
                >
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{alert.label}</span>
                </div>
              ))}
            </section>
          ) : null}

          <section className="order-detail-section" aria-labelledby={`items-heading-${order.id}`}>
            <div className="mb-2 flex items-center justify-between gap-3">
              <h3
                id={`items-heading-${order.id}`}
                className="text-text-primary flex items-center gap-2 text-sm font-semibold"
              >
                <ShoppingBag className="h-4 w-4" aria-hidden="true" />
                Produtos ({order.items.length})
              </h3>
              <strong className="text-brand-700 shrink-0 font-mono text-base">
                {formatCurrency(order.totals.total)}
              </strong>
            </div>
            <div className="border-border bg-surface-secondary overflow-hidden rounded-lg border">
              {order.customerNotes ? (
                <div className="bg-warning-light border-border border-b px-3 py-2">
                  <p className="text-warning text-xs font-semibold">Observação do cliente</p>
                  <p className="text-text-primary mt-0.5 text-sm break-words whitespace-pre-wrap">
                    {order.customerNotes}
                  </p>
                </div>
              ) : null}
              <div className="divide-border divide-y px-3">
                {order.items.map((item) => (
                  <div key={item.id} className="py-2.5">
                    <div className="flex justify-between gap-3 text-sm">
                      <span className="text-text-primary min-w-0 font-semibold break-words">
                        {item.quantity}× {item.productName}
                      </span>
                      <span className="text-text-primary shrink-0 font-mono">
                        {formatCurrency(item.itemTotal)}
                      </span>
                    </div>
                    {item.options.length > 0 ? (
                      <p className="text-text-secondary mt-0.5 text-sm break-words">
                        {formatItemOptions(item.options)}
                      </p>
                    ) : null}
                    {item.notes ? (
                      <p className="text-warning mt-0.5 text-sm font-medium break-words whitespace-pre-wrap">
                        Obs: {item.notes}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
              <dl className="border-border grid grid-cols-2 gap-x-3 gap-y-1 border-t px-3 py-2 text-xs">
                <div className="text-text-secondary flex justify-between gap-2">
                  <dt>Subtotal</dt>
                  <dd>{formatCurrency(order.totals.subtotal)}</dd>
                </div>
                {order.totals.deliveryFee > 0 ? (
                  <div className="text-text-secondary flex justify-between gap-2">
                    <dt>Entrega</dt>
                    <dd>{formatCurrency(order.totals.deliveryFee)}</dd>
                  </div>
                ) : null}
                {order.totals.discount > 0 ? (
                  <div className="text-success col-span-2 flex justify-between gap-2">
                    <dt>Desconto</dt>
                    <dd>-{formatCurrency(order.totals.discount)}</dd>
                  </div>
                ) : null}
              </dl>
            </div>
          </section>

          <section
            className="order-detail-section"
            aria-labelledby={`customer-heading-${order.id}`}
          >
            <h3
              id={`customer-heading-${order.id}`}
              className="text-text-primary mb-2 text-sm font-semibold"
            >
              Cliente e entrega
            </h3>
            <div className="border-border bg-surface-secondary divide-border divide-y overflow-hidden rounded-lg border text-sm">
              <div className="order-detail-contact-row p-3">
                <div className="flex min-w-0 items-start gap-2">
                  <User className="text-text-muted mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="text-text-primary font-semibold break-words">
                      {order.customer.name}
                    </p>
                    <p className="text-text-secondary mt-0.5 flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      {order.customer.phone && normalizedPhone
                        ? order.customer.phone
                        : 'Contato protegido'}
                    </p>
                  </div>
                </div>
                {order.customer.phone && normalizedPhone ? (
                  <div className="order-detail-contact-actions flex gap-2" data-order-print-hide>
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
                ) : null}
              </div>

              <div className="order-detail-address-row flex items-start gap-2 p-3">
                <MapPin className="text-text-muted mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-text-secondary text-xs font-medium">
                    {order.modality === 'DELIVERY' ? 'Endereço de entrega' : 'Retirada no local'}
                  </p>
                  <p className="text-text-primary mt-0.5 font-medium break-words">
                    {order.modality === 'DELIVERY'
                      ? (deliveryAddress ?? 'Endereço protegido')
                      : 'Cliente retira o pedido no estabelecimento'}
                  </p>
                </div>
                {order.modality === 'DELIVERY' && mapUrl ? (
                  <Button asChild variant="outline" size="sm" data-order-print-hide>
                    <a
                      href={mapUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Abrir endereço do pedido ${order.orderNumber} no mapa`}
                    >
                      <MapPin aria-hidden="true" /> Mapa
                      <ExternalLink aria-hidden="true" />
                    </a>
                  </Button>
                ) : null}
              </div>
            </div>
          </section>

          <section
            className="order-detail-section"
            aria-labelledby={`operation-heading-${order.id}`}
          >
            <h3
              id={`operation-heading-${order.id}`}
              className="text-text-primary mb-2 text-sm font-semibold"
            >
              Operação
            </h3>
            <div className="border-border bg-surface-secondary rounded-lg border p-3">
              <dl className="grid grid-cols-2 gap-x-3 gap-y-3 text-sm">
                <div>
                  <dt className="text-text-secondary text-xs">Etapa atual</dt>
                  <dd className="text-text-primary mt-0.5 flex items-center gap-1.5 font-semibold">
                    <Clock3 className="h-4 w-4" aria-hidden="true" />
                    {order.operational.stageLabel}
                  </dd>
                  <dd className="text-text-secondary mt-0.5 text-xs">
                    {formatElapsedMinutes(order.operational.elapsedMinutes)}
                  </dd>
                </div>
                <div>
                  <dt className="text-text-secondary text-xs">Pagamento</dt>
                  <dd className="text-text-primary mt-0.5 flex items-center gap-1.5 font-semibold">
                    <Receipt className="h-4 w-4" aria-hidden="true" />
                    {order.payment.method === 'PIX'
                      ? 'Pix'
                      : order.payment.method === 'CASH'
                        ? 'Dinheiro'
                        : 'Cartão'}
                  </dd>
                  <dd
                    className={`mt-0.5 inline-flex rounded px-1.5 py-0.5 text-xs ${paymentInfo.color}`}
                  >
                    {paymentInfo.label}
                  </dd>
                </div>
                {promisedWindow ? (
                  <div className="border-border col-span-2 border-t pt-2.5">
                    <dt className="sr-only">Previsão</dt>
                    <dd
                      className={cn(
                        'flex items-start gap-2 text-sm font-semibold',
                        promisedWindow.isOverdue ? 'text-error' : 'text-info',
                      )}
                    >
                      <Clock3 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                      {promisedWindow.label}
                    </dd>
                  </div>
                ) : null}
                {order.payment.method === 'CASH' && order.payment.changeFor ? (
                  <div className="border-border col-span-2 border-t pt-2.5">
                    <dt className="text-text-secondary text-xs">Troco</dt>
                    <dd className="text-text-primary mt-0.5 font-medium">
                      Para {formatCurrency(order.payment.changeFor)}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </div>

            <details className="order-detail-disclosure border-border mt-2 border-t">
              <summary className="text-text-primary flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium">
                Linha do tempo e métricas
                <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />
              </summary>
              <div className="pb-3">
                <OrderStatusTimeline order={order} timeZone={timeZone} />
                <dl className="border-border mt-3 grid grid-cols-2 gap-x-4 gap-y-3 border-t pt-3 text-sm">
                  {[
                    ['Aceite', order.operational.durations.acceptanceMinutes],
                    ['Preparo', order.operational.durations.preparationMinutes],
                    ['Pronto', order.operational.durations.readyMinutes],
                    ['Entrega', order.operational.durations.deliveryMinutes],
                    ['Total', order.operational.durations.totalMinutes],
                  ].map(([label, value]) => (
                    <div key={label as string}>
                      <dt className="text-text-secondary text-xs">{label}</dt>
                      <dd className="text-text-primary mt-0.5 flex items-center gap-1 font-mono font-bold">
                        <Timer className="h-3.5 w-3.5" aria-hidden="true" />
                        {formatOperationalDuration(value as number | null)}
                      </dd>
                    </div>
                  ))}
                </dl>
                {order.lastChangedBy ? (
                  <p className="text-text-secondary border-border mt-3 border-t pt-3 text-xs">
                    Última alteração por {order.lastChangedBy}
                  </p>
                ) : null}
                {order.recentPaymentHistory.length > 0 ? (
                  <ol className="border-border mt-3 space-y-2 border-t pt-3 text-xs">
                    {order.recentPaymentHistory.map((entry) => (
                      <li key={entry.id} className="flex items-start justify-between gap-3">
                        <span>
                          <span className="text-text-primary block">
                            {paymentHistoryLabels[entry.action] ?? 'Pagamento atualizado'}
                          </span>
                          <span className="text-text-secondary">{entry.actorName}</span>
                          {entry.note ? (
                            <span className="text-text-secondary mt-0.5 block whitespace-pre-wrap">
                              {entry.note}
                            </span>
                          ) : null}
                        </span>
                        <time className="text-text-secondary shrink-0" dateTime={entry.createdAt}>
                          {formatDate(entry.createdAt, timeZone, true)}
                        </time>
                      </li>
                    ))}
                  </ol>
                ) : null}
              </div>
            </details>
          </section>

          <InternalOrderNotes
            order={order}
            storeId={storeId}
            authorizationScope={authorizationScope}
            timeZone={timeZone}
            onOrderChanged={onOrderChanged}
          />

          {displayedHistory.length > 0 ? (
            <section aria-labelledby={`history-heading-${order.id}`}>
              <button
                type="button"
                className="focus-visible:ring-brand-500 flex min-h-11 w-full items-center justify-between gap-3 rounded-lg text-left focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                aria-expanded={historyExpanded}
                aria-controls={`history-content-${order.id}`}
                onClick={toggleHistory}
              >
                <span
                  id={`history-heading-${order.id}`}
                  className="text-text-primary flex items-center gap-2 text-sm font-semibold"
                >
                  <History aria-hidden="true" /> Histórico do pedido
                </span>
                <ChevronDown
                  className={cn(
                    'h-4 w-4 shrink-0 transition-transform duration-200',
                    historyExpanded && 'rotate-180',
                  )}
                  aria-hidden="true"
                />
              </button>
              {historyExpanded ? (
                <div id={`history-content-${order.id}`} className="mt-2">
                  {historyQuery.error ? (
                    <p
                      className="bg-error-light text-error mb-3 rounded-lg px-3 py-2 text-xs"
                      role="status"
                    >
                      Não foi possível atualizar o histórico. Tente novamente.
                    </p>
                  ) : null}
                  <HistoryList entries={displayedHistory} timeZone={timeZone} />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2"
                    onClick={loadMoreHistory}
                    disabled={historyQuery.isFetching}
                  >
                    {historyQuery.isFetching
                      ? 'Carregando…'
                      : historyQuery.hasNextPage
                        ? 'Carregar mais'
                        : 'Atualizar histórico'}
                  </Button>
                </div>
              ) : null}
            </section>
          ) : null}
        </div>
      </div>

      <footer
        className="order-detail-footer border-border bg-surface sticky bottom-0 z-10 shrink-0 border-t p-2.5 pb-[calc(env(safe-area-inset-bottom)+0.625rem)] sm:p-3 print:hidden"
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

'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { useState } from 'react';
import { ExternalLink, History, MapPin, Phone, Receipt, User, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useMediaQuery } from '@/hooks/use-media-query';
import { useOrderDetails, useOrderHistory } from '@/hooks/use-orders';
import { normalizePhone } from '@/lib/brazil';
import { formatCurrency } from '@/lib/utils';
import type { OrderDetailsDTO, OrderHistoryItemDTO } from '@/types/order-query';
import { paymentStatusMap, statusMap } from './order-card';
import { StatusActions } from './status-actions';

interface OrderDetailModalProps {
  orderId: string | null;
  storeId: string;
  authorizationScope: string;
  timeZone: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function formatDate(value: string, timeZone: string, compact = false) {
  const options: Intl.DateTimeFormatOptions = compact
    ? { timeZone, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }
    : { timeZone, dateStyle: 'short', timeStyle: 'short' };
  return new Intl.DateTimeFormat('pt-BR', options).format(new Date(value));
}

function HistoryList({ entries, timeZone }: { entries: OrderHistoryItemDTO[]; timeZone: string }) {
  return (
    <ol className="space-y-2 text-sm">
      {entries.map((entry) => (
        <li key={entry.id} className="flex items-start justify-between gap-3 border-b border-border pb-2 last:border-0">
          <span className="min-w-0 text-text-primary">
            <span className="block">{statusMap[entry.toStatus].label}</span>
            <span className="block truncate text-xs text-text-secondary">{entry.actorName}</span>
          </span>
          <time className="shrink-0 text-xs text-text-secondary" dateTime={entry.createdAt}>
            {formatDate(entry.createdAt, timeZone, true)}
          </time>
        </li>
      ))}
    </ol>
  );
}

function DetailsSkeleton({ dialog, onClose }: { dialog: boolean; onClose: () => void }) {
  return (
    <div className="flex min-h-96 flex-col" role="status" aria-label="Carregando detalhes do pedido">
      <div className="flex items-start justify-between gap-4 border-b border-border p-4">
        <div>
        {dialog ? <Dialog.Title className="sr-only">Carregando pedido</Dialog.Title> : null}
        {dialog ? <Dialog.Description className="sr-only">Aguarde os detalhes do pedido.</Dialog.Description> : null}
        <div className="h-6 w-40 animate-pulse rounded bg-surface-tertiary" />
        <div className="mt-2 h-4 w-56 animate-pulse rounded bg-surface-tertiary" />
        </div>
        <Button variant="ghost" size="icon" aria-label="Fechar detalhes" onClick={onClose}><X aria-hidden="true" /></Button>
      </div>
      <div className="grid flex-1 gap-4 p-4 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-28 animate-pulse rounded-xl bg-surface-tertiary" />
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
  dialog,
}: {
  order: OrderDetailsDTO;
  storeId: string;
  authorizationScope: string;
  timeZone: string;
  onClose: () => void;
  dialog: boolean;
}) {
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const historyQuery = useOrderHistory(storeId, authorizationScope, order.id, historyExpanded);
  const fullHistory = historyQuery.data?.pages.flatMap((page) => page.items) ?? null;
  const displayedHistory = fullHistory ?? order.recentHistory.slice(0, 4);
  const paymentInfo = paymentStatusMap[order.payment.status];

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
      <div className="flex items-start justify-between gap-4 border-b border-border p-4">
        <div>
          {dialog ? (
            <Dialog.Title className="text-xl font-bold text-text-primary">Pedido #{order.orderNumber}</Dialog.Title>
          ) : (
            <h2 className="text-xl font-bold text-text-primary">Pedido #{order.orderNumber}</h2>
          )}
          {dialog ? (
            <Dialog.Description className="mt-1 text-sm text-text-secondary">Recebido em {formatDate(order.createdAt, timeZone)}</Dialog.Description>
          ) : (
            <p className="mt-1 text-sm text-text-secondary">Recebido em {formatDate(order.createdAt, timeZone)}</p>
          )}
          <p className="mt-1 text-xs text-text-secondary">Versão {order.version}{order.lastChangedBy ? ` · última alteração por ${order.lastChangedBy}` : ''}</p>
        </div>
        <Button variant="ghost" size="icon" aria-label={`Fechar pedido ${order.orderNumber}`} onClick={onClose}>
          <X aria-hidden="true" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className={dialog ? 'grid gap-6 md:grid-cols-2' : 'space-y-6'}>
          <div className="space-y-6">
            <section aria-labelledby={`customer-heading-${order.id}`}>
              <h3 id={`customer-heading-${order.id}`} className="mb-3 text-sm font-semibold text-text-primary">Cliente</h3>
              <div className="space-y-3 rounded-lg bg-surface-secondary p-3 text-sm">
                <div className="flex items-center gap-2">
                  <User className="text-text-muted" aria-hidden="true" />
                  <span className="font-medium text-text-primary">{order.customer.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="text-text-muted" aria-hidden="true" />
                  {order.customer.phone ? (
                    <a href={`https://wa.me/${normalizePhone(order.customer.phone)}`} target="_blank" rel="noreferrer" className="flex min-h-11 items-center gap-1 text-brand-700 underline-offset-4 hover:underline">
                      {order.customer.phone} <ExternalLink aria-hidden="true" />
                    </a>
                  ) : (
                    <span className="text-text-secondary">Contato protegido</span>
                  )}
                </div>
              </div>
            </section>

            <section aria-labelledby={`fulfillment-heading-${order.id}`}>
              <h3 id={`fulfillment-heading-${order.id}`} className="mb-3 text-sm font-semibold text-text-primary">Entrega e pagamento</h3>
              <div className="space-y-3 rounded-lg bg-surface-secondary p-3 text-sm">
                <div>
                  <div className="mb-1 flex items-center gap-2 text-text-secondary"><MapPin aria-hidden="true" /><span>{order.modality === 'DELIVERY' ? 'Entrega' : 'Retirada'}</span></div>
                  {order.modality === 'DELIVERY' && <p className="break-words pl-6 font-medium text-text-primary">{order.delivery.address ?? 'Endereço protegido'}</p>}
                </div>
                <div className="border-t border-border pt-3">
                  <div className="mb-1 flex flex-wrap items-center justify-between gap-3 text-text-secondary">
                    <div className="flex items-center gap-2"><Receipt aria-hidden="true" /><span>{order.payment.method === 'PIX' ? 'Pix' : order.payment.method === 'CASH' ? 'Dinheiro' : 'Cartão'}</span></div>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${paymentInfo.color}`}>{paymentInfo.label}</span>
                  </div>
                  {order.payment.method === 'CASH' && order.payment.changeFor && <p className="pl-6 text-text-primary">Troco para {formatCurrency(order.payment.changeFor)}</p>}
                </div>
              </div>
            </section>

            {order.customerNotes && (
              <section aria-labelledby={`notes-heading-${order.id}`}>
                <h3 id={`notes-heading-${order.id}`} className="mb-2 text-sm font-semibold text-text-primary">Observação do cliente</h3>
                <p className="whitespace-pre-wrap break-words rounded-lg bg-warning-light p-3 text-sm text-text-primary">{order.customerNotes}</p>
              </section>
            )}
          </div>

          <div className="space-y-6">
            <section aria-labelledby={`items-heading-${order.id}`}>
              <h3 id={`items-heading-${order.id}`} className="mb-3 text-sm font-semibold text-text-primary">Itens ({order.items.length})</h3>
              <div className="rounded-lg bg-surface-secondary p-3">
                <div className="space-y-3">
                  {order.items.map((item) => (
                    <div key={item.id} className="border-b border-border pb-3 last:border-0 last:pb-0">
                      <div className="flex justify-between gap-3 text-sm">
                        <span className="min-w-0 break-words font-medium text-text-primary">{item.quantity}× {item.productName}</span>
                        <span className="shrink-0 font-mono text-text-primary">{formatCurrency(item.itemTotal)}</span>
                      </div>
                      {item.options.length > 0 && <p className="mt-1 break-words pl-4 text-xs text-text-secondary">{item.options.map((option) => option.name).join(', ')}</p>}
                      {item.notes && <p className="mt-1 whitespace-pre-wrap break-words pl-4 text-xs italic text-text-secondary">“{item.notes}”</p>}
                    </div>
                  ))}
                </div>
                <div className="mt-4 space-y-1.5 border-t border-border pt-3 text-sm">
                  <div className="flex justify-between text-text-secondary"><span>Subtotal</span><span>{formatCurrency(order.totals.subtotal)}</span></div>
                  {order.totals.discount > 0 && <div className="flex justify-between text-text-secondary"><span>Desconto</span><span>-{formatCurrency(order.totals.discount)}</span></div>}
                  {order.totals.deliveryFee > 0 && <div className="flex justify-between text-text-secondary"><span>Taxa de entrega</span><span>{formatCurrency(order.totals.deliveryFee)}</span></div>}
                  <div className="flex justify-between pt-1.5 font-bold text-text-primary"><span>Total</span><span className="font-mono text-base text-brand-700">{formatCurrency(order.totals.total)}</span></div>
                </div>
              </div>
            </section>

            {displayedHistory.length > 0 && (
              <section aria-labelledby={`history-heading-${order.id}`}>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 id={`history-heading-${order.id}`} className="flex items-center gap-2 text-sm font-semibold text-text-primary"><History aria-hidden="true" /> Histórico</h3>
                  <Button variant="ghost" size="sm" onClick={loadHistory} disabled={historyQuery.isFetching}>
                    {historyQuery.isFetching ? 'Carregando…' : fullHistory && historyQuery.hasNextPage ? 'Carregar mais' : fullHistory ? 'Atualizado' : 'Ver completo'}
                  </Button>
                </div>
                {historyQuery.error && (
                  <p className="mb-3 rounded-lg bg-error-light px-3 py-2 text-xs text-error" role="status">
                    Não foi possível atualizar o histórico. Tente novamente.
                  </p>
                )}
                <HistoryList entries={displayedHistory} timeZone={timeZone} />
              </section>
            )}
          </div>
        </div>
      </div>

      <div className="border-t border-border bg-surface-secondary p-4">
        <StatusActions order={order} storeId={storeId} authorizationScope={authorizationScope} onOrderChanged={onClose} />
      </div>
    </>
  );
}

export function OrderDetailModal({ orderId, storeId, authorizationScope, timeZone, open, onOpenChange }: OrderDetailModalProps) {
  const isDesktop = useMediaQuery('(min-width: 1280px)');
  const detailsQuery = useOrderDetails(storeId, authorizationScope, orderId);
  if (!orderId) return null;

  const content = detailsQuery.isLoading ? (
    <DetailsSkeleton dialog={!isDesktop} onClose={() => onOpenChange(false)} />
  ) : detailsQuery.error || !detailsQuery.data ? (
    <div className="p-5">
      {!isDesktop && <Dialog.Title className="text-lg font-semibold text-text-primary">Detalhes do pedido</Dialog.Title>}
      {!isDesktop && <Dialog.Description className="mt-1 text-sm text-text-secondary">Não foi possível carregar este pedido.</Dialog.Description>}
      <p className="text-sm text-error">Não foi possível carregar os detalhes atualizados.</p>
      <div className="mt-4 flex gap-2"><Button variant="outline" onClick={() => detailsQuery.refetch()}>Tentar novamente</Button><Button variant="ghost" onClick={() => onOpenChange(false)}>Fechar</Button></div>
    </div>
  ) : (
    <OrderDetails order={detailsQuery.data} storeId={storeId} authorizationScope={authorizationScope} timeZone={timeZone} dialog={!isDesktop} onClose={() => onOpenChange(false)} />
  );

  if (isDesktop) {
    return (
      <aside className="sticky top-6 flex max-h-[calc(100vh-3rem)] flex-col overflow-hidden rounded-xl border border-border bg-surface" aria-label="Detalhes do pedido">
        {content}
      </aside>
    );
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-tinta/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100vh-2rem)] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl bg-surface shadow-lg focus:outline-none">
          {content}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

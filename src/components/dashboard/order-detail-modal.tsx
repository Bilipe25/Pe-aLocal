'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { ExternalLink, History, MapPin, Phone, Receipt, User, X } from 'lucide-react';
import type { PaymentStatus } from '@prisma/client';

import { Button } from '@/components/ui/button';
import { useMediaQuery } from '@/hooks/use-media-query';
import { formatCurrency } from '@/lib/utils';
import type { OrderWithDetails } from '@/types/order';
import { paymentStatusMap, statusMap } from './order-card';
import { StatusActions } from './status-actions';
import type { OrderCapabilities } from '@/features/orders/capabilities';

interface OrderDetailModalProps {
  order: OrderWithDetails | null;
  capabilities: OrderCapabilities;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function OrderDetails({ order, capabilities, onClose, dialog = false }: { order: OrderWithDetails; capabilities: OrderCapabilities; onClose: () => void; dialog?: boolean }) {
  const paymentInfo = paymentStatusMap[order.paymentStatus as PaymentStatus];
  const recentHistory = order.statusHistory.slice(0, 4);

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
            <Dialog.Description className="mt-1 text-sm text-text-secondary">Recebido em {new Date(order.createdAt).toLocaleString('pt-BR')}</Dialog.Description>
          ) : (
            <p className="mt-1 text-sm text-text-secondary">Recebido em {new Date(order.createdAt).toLocaleString('pt-BR')}</p>
          )}
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
                  <span className="font-medium text-text-primary">{order.customerName}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="text-text-muted" aria-hidden="true" />
                  {capabilities.canViewCustomerContact ? (
                    <a href={`https://wa.me/55${order.customerPhone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="flex min-h-11 items-center gap-1 text-brand-700 underline-offset-4 hover:underline">
                      {order.customerPhone} <ExternalLink aria-hidden="true" />
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
                  {order.modality === 'DELIVERY' && <p className="pl-6 font-medium text-text-primary">{capabilities.canViewCustomerContact ? order.deliveryAddress : 'Endereço protegido'}</p>}
                </div>
                <div className="border-t border-border pt-3">
                  <div className="mb-1 flex items-center justify-between gap-3 text-text-secondary">
                    <div className="flex items-center gap-2"><Receipt aria-hidden="true" /><span>{order.paymentMethod === 'PIX' ? 'Pix' : order.paymentMethod === 'CASH' ? 'Dinheiro' : 'Cartão'}</span></div>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${paymentInfo.color}`}>{paymentInfo.label}</span>
                  </div>
                  {capabilities.canViewPaymentDetails && order.paymentMethod === 'CASH' && order.changeFor && <p className="pl-6 text-text-primary">Troco para {formatCurrency(order.changeFor)}</p>}
                </div>
              </div>
            </section>
          </div>

          <div className="space-y-6">
            <section aria-labelledby={`items-heading-${order.id}`}>
              <h3 id={`items-heading-${order.id}`} className="mb-3 text-sm font-semibold text-text-primary">Itens ({order.items.length})</h3>
              <div className="rounded-lg bg-surface-secondary p-3">
                <div className="space-y-3">
                  {order.items.map((item) => (
                    <div key={item.id} className="border-b border-border pb-3 last:border-0 last:pb-0">
                      <div className="flex justify-between gap-3 text-sm">
                        <span className="font-medium text-text-primary">{item.quantity}× {item.productName}</span>
                        <span className="shrink-0 font-mono text-text-primary">{formatCurrency(item.itemTotal)}</span>
                      </div>
                      {item.options?.length > 0 && <p className="mt-1 pl-4 text-xs text-text-secondary">{item.options.map((option) => option.optionName).join(', ')}</p>}
                      {item.notes && <p className="mt-1 pl-4 text-xs italic text-text-secondary">“{item.notes}”</p>}
                    </div>
                  ))}
                </div>
                <div className="mt-4 space-y-1.5 border-t border-border pt-3 text-sm">
                  <div className="flex justify-between text-text-secondary"><span>Subtotal</span><span>{formatCurrency(order.subtotal)}</span></div>
                  {order.deliveryFee > 0 && <div className="flex justify-between text-text-secondary"><span>Taxa de entrega</span><span>{formatCurrency(order.deliveryFee)}</span></div>}
                  <div className="flex justify-between pt-1.5 font-bold text-text-primary"><span>Total</span><span className="font-mono text-base text-brand-700">{formatCurrency(order.total)}</span></div>
                </div>
              </div>
            </section>

            {capabilities.canViewHistory && recentHistory.length > 0 && (
              <section aria-labelledby={`history-heading-${order.id}`}>
                <h3 id={`history-heading-${order.id}`} className="mb-3 flex items-center gap-2 text-sm font-semibold text-text-primary"><History aria-hidden="true" /> Histórico recente</h3>
                <ol className="space-y-2 text-sm">
                  {recentHistory.map((entry) => (
                    <li key={entry.id} className="flex items-start justify-between gap-3 border-b border-border pb-2 last:border-0">
                      <span className="text-text-primary">{statusMap[entry.toStatus].label}</span>
                      <time className="shrink-0 text-xs text-text-secondary" dateTime={entry.createdAt.toISOString()}>{new Date(entry.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</time>
                    </li>
                  ))}
                </ol>
              </section>
            )}
          </div>
        </div>
      </div>

      <div className="border-t border-border bg-surface-secondary p-4">
        <StatusActions order={order} capabilities={capabilities} onOrderChanged={onClose} />
      </div>
    </>
  );
}

export function OrderDetailModal({ order, capabilities, open, onOpenChange }: OrderDetailModalProps) {
  const isDesktop = useMediaQuery('(min-width: 1280px)');
  if (!order) return null;

  if (isDesktop) {
    return (
      <aside className="sticky top-6 flex max-h-[calc(100vh-3rem)] flex-col overflow-hidden rounded-xl border border-border bg-surface" aria-label={`Detalhes do pedido ${order.orderNumber}`}>
        <OrderDetails order={order} capabilities={capabilities} onClose={() => onOpenChange(false)} />
      </aside>
    );
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-tinta/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100vh-2rem)] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl bg-surface shadow-lg focus:outline-none">
          <OrderDetails order={order} capabilities={capabilities} dialog onClose={() => onOpenChange(false)} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

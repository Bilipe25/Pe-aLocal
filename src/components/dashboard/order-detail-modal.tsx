'use client';

import { formatCurrency } from '@/lib/utils';
import { paymentStatusMap } from './order-card';
import { StatusActions } from './status-actions';
import { X, MapPin, Receipt, Phone, User, ExternalLink } from 'lucide-react';
import type { PaymentStatus } from '@prisma/client';
import type { OrderWithDetails } from '@/types/order';

export function OrderDetailModal({ order, onClose }: { order: OrderWithDetails; onClose: () => void }) {
  const paymentInfo = paymentStatusMap[order.paymentStatus as PaymentStatus];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-surface shadow-xl">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border p-4">
          <div>
            <h2 className="font-display text-xl font-bold text-text-primary">
              Pedido #{order.orderNumber}
            </h2>
            <p className="text-sm text-text-secondary">
              Feito em {new Date(order.createdAt).toLocaleString('pt-BR')}
            </p>
          </div>
          <button 
            onClick={onClose}
            className="rounded-full p-2 text-text-secondary hover:bg-surface-secondary"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid gap-6 md:grid-cols-2">
            
            {/* Esquerda: Cliente e Info */}
            <div className="space-y-6">
              <section>
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-text-secondary">
                  Cliente
                </h3>
                <div className="space-y-3 rounded-lg border border-border bg-surface-secondary/50 p-3 text-sm">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-text-tertiary" />
                    <span className="font-medium text-text-primary">{order.customerName}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-text-tertiary" />
                    <a 
                      href={`https://wa.me/55${order.customerPhone.replace(/\D/g, '')}`} 
                      target="_blank" rel="noreferrer"
                      className="text-brand-600 hover:underline flex items-center gap-1"
                    >
                      {order.customerPhone} <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </div>
              </section>

              <section>
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-text-secondary">
                  Entrega & Pagamento
                </h3>
                <div className="space-y-3 rounded-lg border border-border bg-surface-secondary/50 p-3 text-sm">
                  <div>
                    <div className="flex items-center gap-2 text-text-secondary mb-1">
                      <MapPin className="h-4 w-4" />
                      <span>{order.modality === 'DELIVERY' ? 'Entrega' : 'Retirada'}</span>
                    </div>
                    {order.modality === 'DELIVERY' && (
                      <p className="pl-6 font-medium text-text-primary">
                        {order.deliveryAddress}
                      </p>
                    )}
                  </div>
                  <div className="pt-2 border-t border-border">
                    <div className="flex items-center justify-between text-text-secondary mb-1">
                      <div className="flex items-center gap-2">
                        <Receipt className="h-4 w-4" />
                        <span>{order.paymentMethod === 'PIX' ? 'Pix' : order.paymentMethod === 'CASH' ? 'Dinheiro' : 'Cartão'}</span>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${paymentInfo.color}`}>
                        {paymentInfo.label}
                      </span>
                    </div>
                    {order.paymentMethod === 'CASH' && order.changeFor && (
                      <p className="pl-6 text-text-primary">
                        Troco para {formatCurrency(order.changeFor)}
                      </p>
                    )}
                  </div>
                </div>
              </section>
            </div>

            {/* Direita: Itens do Pedido */}
            <section>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-text-secondary">
                Itens ({order.items.length})
              </h3>
              <div className="rounded-lg border border-border bg-surface-secondary/50 p-3">
                <div className="space-y-3">
                  {order.items.map((item) => (
                    <div key={item.id} className="border-b border-border pb-3 last:border-0 last:pb-0">
                      <div className="flex justify-between text-sm">
                        <span className="font-medium text-text-primary">
                          {item.quantity}x {item.productName}
                        </span>
                        <span className="font-mono text-text-primary">
                          {formatCurrency(item.itemTotal)}
                        </span>
                      </div>
                      {item.options?.length > 0 && (
                        <p className="mt-1 text-xs text-text-secondary pl-4">
                          {item.options.map((o) => o.optionName).join(', ')}
                        </p>
                      )}
                      {item.notes && (
                        <p className="mt-1 text-xs italic text-text-tertiary pl-4">
                          &quot;{item.notes}&quot;
                        </p>
                      )}
                    </div>
                  ))}
                </div>

                <div className="mt-4 space-y-1.5 border-t border-border pt-3 text-sm">
                  <div className="flex justify-between text-text-secondary">
                    <span>Subtotal</span>
                    <span>{formatCurrency(order.subtotal)}</span>
                  </div>
                  {order.deliveryFee > 0 && (
                    <div className="flex justify-between text-text-secondary">
                      <span>Taxa de entrega</span>
                      <span>{formatCurrency(order.deliveryFee)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-text-primary pt-1.5">
                    <span>Total</span>
                    <span className="font-mono text-base text-brand-600">
                      {formatCurrency(order.total)}
                    </span>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>

        {/* Footer / Ações */}
        <div className="border-t border-border bg-surface-secondary/30 p-4">
          <StatusActions order={order} />
        </div>
        
      </div>
    </div>
  );
}

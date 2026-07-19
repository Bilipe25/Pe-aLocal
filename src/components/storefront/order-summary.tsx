import { formatCurrency } from '@/lib/utils';
import type { CartItem } from '@/stores/cart-store';

interface OrderSummaryProps {
  items: CartItem[];
  subtotal: number;
  deliveryFee: number;
  total: number;
}

export function OrderSummary({ items, subtotal, deliveryFee, total }: OrderSummaryProps) {
  return (
    <div className="rounded-xl border border-tinta/10 bg-papel p-4 shadow-sm">
      <h3 className="font-display text-base font-bold text-tinta">Resumo do pedido</h3>

      <div className="mt-3 space-y-2">
        {items.map((item) => (
          <div key={item.id} className="flex items-start justify-between text-sm">
            <div className="min-w-0 flex-1">
              <span className="break-words text-tinta">
                {item.quantity}x {item.productName}
              </span>
              {item.selectedOptions.length > 0 && (
                <p className="break-words text-sm text-text-muted">
                  {item.selectedOptions.map((o) => o.name).join(', ')}
                </p>
              )}
            </div>
            <span className="shrink-0 font-mono text-sm font-bold text-tinta">
              {formatCurrency(item.unitPrice * item.quantity)}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-3 space-y-1 border-t border-tinta/5 pt-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-text-muted">Subtotal</span>
          <span className="font-mono text-sm text-text-muted">{formatCurrency(subtotal)}</span>
        </div>
        {deliveryFee > 0 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-text-muted">Taxa de entrega</span>
            <span className="font-mono text-sm text-text-muted">{formatCurrency(deliveryFee)}</span>
          </div>
        )}
        <div className="flex items-center justify-between text-sm font-semibold">
          <span className="text-tinta">Total</span>
          <span className="storefront-action-text font-mono text-base font-bold">{formatCurrency(total)}</span>
        </div>
      </div>
    </div>
  );
}

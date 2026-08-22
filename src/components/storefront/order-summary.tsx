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
    <div className="border-tinta/10 bg-papel rounded-xl border p-4 shadow-sm">
      <h3 className="font-display text-tinta text-base font-bold">Resumo do pedido</h3>

      <div className="mt-3 space-y-2">
        {items.map((item) => (
          <div key={item.id} className="flex items-start justify-between text-sm">
            <div className="min-w-0 flex-1">
              <span className="text-tinta break-words">
                {item.quantity}x {item.productName}
              </span>
              {item.selectedOptions.length > 0 && (
                <p className="text-text-muted text-sm break-words">
                  {item.selectedOptions.map((o) => o.name).join(', ')}
                </p>
              )}
            </div>
            <span className="text-tinta shrink-0 font-mono text-sm font-bold">
              {formatCurrency(item.unitPrice * item.quantity)}
            </span>
          </div>
        ))}
      </div>

      <div className="border-tinta/5 mt-3 space-y-1 border-t pt-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-text-muted">Subtotal</span>
          <span className="text-text-muted font-mono text-sm">{formatCurrency(subtotal)}</span>
        </div>
        {deliveryFee > 0 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-text-muted">Taxa de entrega</span>
            <span className="text-text-muted font-mono text-sm">{formatCurrency(deliveryFee)}</span>
          </div>
        )}
        <div className="flex items-center justify-between text-sm font-semibold">
          <span className="text-tinta">Total</span>
          <span className="storefront-action-text font-mono text-base font-bold">
            {formatCurrency(total)}
          </span>
        </div>
      </div>
    </div>
  );
}

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
            <div className="flex-1 min-w-0">
              <span className="text-tinta">
                {item.quantity}x {item.productName}
              </span>
              {item.selectedOptions.length > 0 && (
                <p className="text-xs text-tinta/50">
                  {item.selectedOptions.map((o) => o.name).join(', ')}
                </p>
              )}
            </div>
            <span className="shrink-0 font-mono text-xs font-bold text-tinta">
              {formatCurrency(item.unitPrice * item.quantity)}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-3 space-y-1 border-t border-tinta/5 pt-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-tinta/60">Subtotal</span>
          <span className="font-mono text-xs text-tinta/60">{formatCurrency(subtotal)}</span>
        </div>
        {deliveryFee > 0 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-tinta/60">Taxa de entrega</span>
            <span className="font-mono text-xs text-tinta/60">{formatCurrency(deliveryFee)}</span>
          </div>
        )}
        <div className="flex items-center justify-between text-sm font-semibold">
          <span className="text-tinta">Total</span>
          <span className="font-mono text-base font-bold text-pimenta">{formatCurrency(total)}</span>
        </div>
      </div>
    </div>
  );
}

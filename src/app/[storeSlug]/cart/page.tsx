'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Minus, Plus, Trash2, ShoppingBag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCartStore } from '@/stores/cart-store';
import { formatCurrency } from '@/lib/utils';

export default function CartPage() {
  const params = useParams<{ storeSlug: string }>();
  const items = useCartStore((s) => s.items);
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const removeItem = useCartStore((s) => s.removeItem);
  const clearCart = useCartStore((s) => s.clearCart);
  const getTotal = useCartStore((s) => s.getTotal);

  const total = getTotal();

  if (items.length === 0) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-12 text-center">
        <div className="mb-4 inline-flex rounded-full bg-kraft/50 p-4">
          <ShoppingBag className="h-8 w-8 text-tinta/40" />
        </div>
        <h2 className="font-display text-xl font-bold text-tinta">Sacola vazia</h2>
        <p className="mt-1 text-sm text-tinta/60">Adicione itens do cardápio para continuar.</p>
        <Link
          href={`/${params.storeSlug}`}
          className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-pimenta hover:text-pimenta/80"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar ao cardápio
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-4 pb-32 pt-4">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <Link
          href={`/${params.storeSlug}`}
          className="flex items-center gap-1 text-sm text-tinta/60 hover:text-tinta"
        >
          <ArrowLeft className="h-4 w-4" />
          Cardápio
        </Link>
        <button
          onClick={clearCart}
          className="text-xs text-pimenta hover:text-pimenta/80"
        >
          Limpar sacola
        </button>
      </div>

      <h1 className="mb-4 font-display text-xl font-bold text-tinta">Sua Sacola</h1>

      {/* Items */}
      <div className="space-y-3">
        {items.map((item) => (
          <div
            key={item.id}
            className="rounded-xl border border-tinta/10 bg-papel p-3 shadow-sm"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-tinta">{item.productName}</h3>
                {item.selectedOptions.length > 0 && (
                  <p className="mt-0.5 text-xs text-tinta/50">
                    {item.selectedOptions.map((o) => o.name).join(', ')}
                  </p>
                )}
                {item.notes && (
                  <p className="mt-0.5 text-xs text-tinta/40 italic">&ldquo;{item.notes}&rdquo;</p>
                )}
              </div>
              <button
                onClick={() => removeItem(item.id)}
                className="rounded-md p-1 text-tinta/30 hover:bg-pimenta/10 hover:text-pimenta"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-2 flex items-center justify-between">
              {/* Quantity controls */}
              <div className="flex items-center gap-2 rounded-full border border-tinta/15 px-1">
                <button
                  onClick={() => updateQuantity(item.id, item.quantity - 1)}
                  className="rounded-full p-1 text-tinta/60 hover:bg-tinta/5"
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <span className="w-5 text-center font-mono text-xs font-bold text-tinta">
                  {item.quantity}
                </span>
                <button
                  onClick={() => updateQuantity(item.id, item.quantity + 1)}
                  className="rounded-full p-1 text-tinta/60 hover:bg-tinta/5"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>

              <span className="font-mono text-sm font-bold text-tinta">
                {formatCurrency(item.unitPrice * item.quantity)}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Footer fixo com total */}
      <div className="fixed bottom-0 left-0 right-0 border-t border-tinta/10 bg-papel px-4 py-3 shadow-lg">
        <div className="mx-auto max-w-2xl">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm text-tinta/70">Total</span>
            <span className="font-mono text-lg font-bold text-tinta">
              {formatCurrency(total)}
            </span>
          </div>
          <Button
            className="w-full bg-pimenta text-white hover:bg-pimenta/90 font-body font-medium shadow-sm"
            disabled
          >
            Finalizar pedido (em breve)
          </Button>
          <p className="mt-1 text-center text-[10px] text-tinta/40">
            Checkout será implementado na Fase 5
          </p>
        </div>
      </div>
    </main>
  );
}

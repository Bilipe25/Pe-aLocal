'use client';

import { ArrowLeft, Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/utils';
import { useCartStore } from '@/stores/cart-store';

export default function CartPage() {
  const params = useParams<{ storeSlug: string }>();
  const items = useCartStore((state) => state.items);
  const updateQuantity = useCartStore((state) => state.updateQuantity);
  const removeItem = useCartStore((state) => state.removeItem);
  const clearCart = useCartStore((state) => state.clearCart);
  const restoreItems = useCartStore((state) => state.restoreItems);
  const getTotal = useCartStore((state) => state.getTotal);

  const total = getTotal();

  function handleClearCart() {
    const snapshot = items.map((item) => ({ ...item, selectedOptions: [...item.selectedOptions] }));
    const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
    clearCart();
    toast('Sacola limpa', {
      description: `${itemCount} ${itemCount === 1 ? 'item foi removido' : 'itens foram removidos'}.`,
      action: {
        label: 'Desfazer',
        onClick: () => restoreItems(snapshot),
      },
      duration: 6000,
    });
  }

  function handleRemoveItem(itemId: string, productName: string) {
    const snapshot = items.map((item) => ({ ...item, selectedOptions: [...item.selectedOptions] }));
    removeItem(itemId);
    toast(`${productName} removido`, {
      description: 'O item saiu da sua sacola.',
      action: {
        label: 'Desfazer',
        onClick: () => restoreItems(snapshot),
      },
      duration: 6000,
    });
  }

  if (items.length === 0) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-12 text-center">
        <div className="mb-4 inline-flex rounded-full bg-kraft/50 p-4">
          <ShoppingBag className="h-8 w-8 text-text-muted" aria-hidden="true" />
        </div>
        <h1 className="font-display text-xl font-bold text-tinta">Sacola vazia</h1>
        <p className="mt-1 text-sm text-text-muted">
          Adicione itens do cardápio para continuar.
        </p>
        <Link
          href={`/${params.storeSlug}`}
          className="storefront-link mt-4 inline-flex min-h-11 items-center gap-1 text-sm font-medium hover:underline"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Voltar ao cardápio
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-4 pb-32 pt-4">
      <div className="mb-4 flex items-center justify-between">
        <Link
          href={`/${params.storeSlug}`}
          className="flex min-h-11 items-center gap-1 text-sm text-text-muted hover:text-tinta"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Cardápio
        </Link>
        <button
          type="button"
          onClick={handleClearCart}
          className="storefront-link min-h-11 text-sm hover:underline"
        >
          Limpar sacola
        </button>
      </div>

      <h1 className="mb-4 font-display text-xl font-bold text-tinta">Sua Sacola</h1>

      <div className="space-y-3">
        {items.map((item) => (
          <div key={item.id} className="rounded-xl border border-tinta/10 bg-papel p-3 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <h2 className="break-words text-sm font-semibold text-tinta">
                  {item.productName}
                </h2>
                {item.selectedOptions.length > 0 && (
                  <p className="mt-0.5 break-words text-sm text-text-muted">
                    {item.selectedOptions.map((option) => option.name).join(', ')}
                  </p>
                )}
                {item.notes && (
                  <p className="mt-0.5 break-words text-sm text-text-muted italic">
                    &ldquo;{item.notes}&rdquo;
                  </p>
                )}
              </div>
              <button
                type="button"
                aria-label={`Remover ${item.productName} da sacola`}
                onClick={() => handleRemoveItem(item.id, item.productName)}
                className="flex min-h-11 min-w-11 items-center justify-center rounded-md text-text-muted hover:bg-tinta/5 hover:text-tinta"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="mt-2 flex items-center justify-between">
              <div className="flex items-center gap-1 rounded-full border border-tinta/15 px-1">
                <button
                  type="button"
                  aria-label={`Diminuir quantidade de ${item.productName}`}
                  onClick={() => updateQuantity(item.id, item.quantity - 1)}
                  disabled={item.quantity <= 1}
                  className="flex min-h-11 min-w-11 items-center justify-center rounded-full text-text-muted hover:bg-tinta/5"
                >
                  <Minus className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
                <span className="w-5 text-center font-mono text-sm font-bold text-tinta">
                  {item.quantity}
                </span>
                <button
                  type="button"
                  aria-label={`Aumentar quantidade de ${item.productName}`}
                  onClick={() => updateQuantity(item.id, item.quantity + 1)}
                  className="flex min-h-11 min-w-11 items-center justify-center rounded-full text-text-muted hover:bg-tinta/5"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>

              <span className="font-mono text-sm font-bold text-tinta">
                {formatCurrency(item.unitPrice * item.quantity)}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="storefront-fixed-bottom-safe fixed bottom-0 left-0 right-0 border-t border-tinta/10 bg-papel px-4 py-3 shadow-md">
        <div className="mx-auto max-w-2xl">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm text-text-muted">Total</span>
            <span className="font-mono text-lg font-bold text-tinta">{formatCurrency(total)}</span>
          </div>
          <Button asChild className="storefront-primary-action w-full font-body font-medium shadow-sm">
            <Link href={`/${params.storeSlug}/checkout`}>Continuar pedido</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}

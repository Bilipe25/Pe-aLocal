'use client';

import { ArrowLeft, Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/utils';
import { useCartStore } from '@/stores/cart-store';

interface CartViewProps {
  storeSlug: string;
  acceptingOrders: boolean;
  unavailableReason: string;
}

export function CartView({ storeSlug, acceptingOrders, unavailableReason }: CartViewProps) {
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
      action: { label: 'Desfazer', onClick: () => restoreItems(snapshot) },
      duration: 6000,
    });
  }

  function handleRemoveItem(itemId: string, productName: string) {
    const snapshot = items.map((item) => ({ ...item, selectedOptions: [...item.selectedOptions] }));
    removeItem(itemId);
    toast(`${productName} removido`, {
      description: 'O item saiu da sua sacola.',
      action: { label: 'Desfazer', onClick: () => restoreItems(snapshot) },
      duration: 6000,
    });
  }

  if (items.length === 0) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-12 text-center">
        <div className="bg-kraft/50 mb-4 inline-flex rounded-full p-4">
          <ShoppingBag className="text-text-muted h-8 w-8" aria-hidden="true" />
        </div>
        <h1 className="font-display text-tinta text-xl font-bold">Sacola vazia</h1>
        <p className="text-text-muted mt-1 text-sm">Adicione itens do cardápio para continuar.</p>
        <Link
          href={`/${storeSlug}`}
          className="storefront-link mt-4 inline-flex min-h-11 items-center gap-1 text-sm font-medium hover:underline"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Voltar ao cardápio
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-4 pt-4 pb-32">
      <div className="mb-4 flex items-center justify-between">
        <Link
          href={`/${storeSlug}`}
          className="text-text-muted hover:text-tinta flex min-h-11 items-center gap-1 text-sm"
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

      <h1 className="font-display text-tinta mb-4 text-xl font-bold">Sua sacola</h1>

      <div className="space-y-3">
        {items.map((item) => (
          <div key={item.id} className="bg-papel border-tinta/10 rounded-xl border p-3 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <h2 className="text-tinta text-sm font-semibold break-words">{item.productName}</h2>
                {item.selectedOptions.length > 0 && (
                  <p className="text-text-muted mt-0.5 text-sm break-words">
                    {item.selectedOptions.map((option) => option.name).join(', ')}
                  </p>
                )}
                {item.notes && (
                  <p className="text-text-muted mt-0.5 text-sm break-words italic">
                    &ldquo;{item.notes}&rdquo;
                  </p>
                )}
              </div>
              <button
                type="button"
                aria-label={`Remover ${item.productName} da sacola`}
                onClick={() => handleRemoveItem(item.id, item.productName)}
                className="text-text-muted hover:text-tinta hover:bg-tinta/5 flex min-h-11 min-w-11 items-center justify-center rounded-md"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="mt-2 flex items-center justify-between">
              <div className="border-tinta/15 flex items-center gap-1 rounded-full border px-1">
                <button
                  type="button"
                  aria-label={`Diminuir quantidade de ${item.productName}`}
                  onClick={() => updateQuantity(item.id, item.quantity - 1)}
                  disabled={item.quantity <= 1}
                  className="text-text-muted hover:bg-tinta/5 flex min-h-11 min-w-11 items-center justify-center rounded-full"
                >
                  <Minus className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
                <span className="text-tinta w-5 text-center font-mono text-sm font-bold">
                  {item.quantity}
                </span>
                <button
                  type="button"
                  aria-label={`Aumentar quantidade de ${item.productName}`}
                  onClick={() => updateQuantity(item.id, item.quantity + 1)}
                  className="text-text-muted hover:bg-tinta/5 flex min-h-11 min-w-11 items-center justify-center rounded-full"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>

              <span className="text-tinta font-mono text-sm font-bold">
                {formatCurrency(item.unitPrice * item.quantity)}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="storefront-fixed-bottom-safe bg-papel border-tinta/10 fixed right-0 bottom-0 left-0 border-t px-4 py-3 shadow-md">
        <div className="mx-auto max-w-2xl">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-text-muted text-sm">Total</span>
            <span className="text-tinta font-mono text-lg font-bold">{formatCurrency(total)}</span>
          </div>
          {acceptingOrders ? (
            <Button
              asChild
              className="storefront-primary-action font-body w-full font-medium shadow-sm"
            >
              <Link href={`/${storeSlug}/checkout`}>Continuar pedido</Link>
            </Button>
          ) : (
            <div>
              <p className="text-text-muted mb-2 text-center text-sm" role="status">
                {unavailableReason}
              </p>
              <Button type="button" className="w-full" disabled>
                Pedidos indisponíveis
              </Button>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

'use client';

import { RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { repeatOrderIntoCart } from '@/features/storefront/repeat-order';

interface Shortcut {
  orderId: string;
  orderNumber: number;
  occurrences: number;
  items: Array<{ productName: string; quantity: number }>;
  extraItemsCount: number;
}

export function ConsumerRepurchaseSection(props: {
  storeId: string;
  storeSlug: string;
  shortcuts: { usual: Shortcut | null; frequent: Shortcut[] };
}) {
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);

  async function repeat(shortcut: Shortcut) {
    setBusyOrderId(shortcut.orderId);
    try {
      const result = await repeatOrderIntoCart({
        storeId: props.storeId,
        storeSlug: props.storeSlug,
        reference: { orderId: shortcut.orderId },
      });
      if (result.addedQuantity > 0) {
        toast.success(
          `${result.addedQuantity} ${result.addedQuantity === 1 ? 'item adicionado' : 'itens adicionados'} com os valores atuais.`,
        );
      }
      if (result.issueCount > 0) toast.warning('Alguns itens precisam ser revisados.');
    } catch {
      toast.error('Não foi possível repetir este pedido agora.');
    } finally {
      setBusyOrderId(null);
    }
  }

  const cards = [
    ...(props.shortcuts.usual ? [{ shortcut: props.shortcuts.usual, title: 'Seu de sempre' }] : []),
    ...props.shortcuts.frequent.map((shortcut) => ({ shortcut, title: 'Pedido frequente' })),
  ];

  return (
    <section className="my-3 px-4 sm:my-4 sm:px-6" aria-labelledby="consumer-repurchase-title">
      <h2 id="consumer-repurchase-title" className="sr-only">
        Atalhos para pedir novamente
      </h2>
      <div className="flex snap-x snap-mandatory scrollbar-none gap-3 overflow-x-auto pb-2">
        {cards.map(({ shortcut, title }) => (
          <article
            key={shortcut.orderId}
            className="border-border bg-surface w-[min(19rem,calc(100vw-2rem))] shrink-0 snap-start rounded-2xl border p-4"
          >
            <div className="flex items-start gap-3">
              <span className="bg-brand-50 text-brand-700 flex size-10 shrink-0 items-center justify-center rounded-full">
                <RotateCcw className="size-5" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="font-display font-bold">{title}</h3>
                <p className="text-text-secondary mt-0.5 text-xs">
                  Você pediu {shortcut.occurrences} vezes
                </p>
                <ul className="mt-2 text-sm leading-5">
                  {shortcut.items.map((item, index) => (
                    <li key={`${shortcut.orderId}-${index}`} className="truncate">
                      <span className="text-text-muted">{item.quantity}×</span> {item.productName}
                    </li>
                  ))}
                  {shortcut.extraItemsCount > 0 && (
                    <li className="text-text-secondary">+{shortcut.extraItemsCount} itens</li>
                  )}
                </ul>
                <button
                  type="button"
                  disabled={busyOrderId !== null}
                  onClick={() => void repeat(shortcut)}
                  className="text-brand-700 focus-visible:ring-brand-500 mt-3 min-h-11 rounded-md px-1 font-semibold underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:outline-none disabled:opacity-60"
                >
                  {busyOrderId === shortcut.orderId ? 'Revisando…' : 'Pedir novamente'}
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

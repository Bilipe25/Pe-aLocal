'use client';

import * as Dialog from '@radix-ui/react-dialog';
import {
  CheckCircle2,
  Circle,
  MapPin,
  RotateCcw,
  ShoppingBag,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { ProductImage } from '@/components/storefront/product-image';
import { Button } from '@/components/ui/button';
import { cn, formatCurrency } from '@/lib/utils';
import { useCartStore } from '@/stores/cart-store';
import type { CustomerOrderDetailsDTO } from '@/types/order-tracking';

interface OrderDetailsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trackingToken: string;
  storeId: string;
  storeSlug: string;
  initialSummary?: {
    orderNumber: number;
    itemsSummary?: string | null;
    totalCents?: number | null;
  };
}

function formatEventTime(isoString: string) {
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(isoString));
  } catch {
    return '';
  }
}

export function OrderDetailsSheet({
  open,
  onOpenChange,
  trackingToken,
  storeId,
  storeSlug,
  initialSummary,
}: OrderDetailsSheetProps) {
  const [details, setDetails] = useState<CustomerOrderDetailsDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!open || !trackingToken) return;

    let isMounted = true;

    fetch(`/api/orders/details/${trackingToken}?storeSlug=${encodeURIComponent(storeSlug)}`, {
      cache: 'no-store',
    })
      .then((res) => {
        if (!res.ok) throw new Error('Falha ao carregar');
        return res.json();
      })
      .then((data: unknown) => {
        if (isMounted) {
          setDetails(data as CustomerOrderDetailsDTO);
          setLoading(false);
        }
      })
      .catch(() => {
        if (isMounted) {
          setError(true);
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [open, trackingToken, storeSlug]);

  const handleReorder = () => {
    if (!details || details.items.length === 0) return;

    useCartStore.getState().setStore(storeId, storeSlug);

    let addedCount = 0;
    for (const item of details.items) {
      useCartStore.getState().addItem({
        productId: item.productId ?? '',
        productName: item.productName,
        basePrice: item.unitPrice,
        unitPrice: item.unitPrice,
        quantity: item.quantity,
        notes: item.notes ?? '',
        selectedOptions: item.options.map((opt, idx) => ({
          id: `opt-${idx}`,
          name: opt.optionName,
          price: opt.optionPrice,
        })),
      });
      addedCount += item.quantity;
    }

    toast.success(
      `${addedCount} ${addedCount === 1 ? 'item adicionado' : 'itens adicionados'} à sua sacola!`,
    );
    onOpenChange(false);
  };

  const isActive =
    details?.status && details.status !== 'DELIVERED' && details.status !== 'CANCELLED';

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="storefront-order-details-overlay" />
        <Dialog.Content className="storefront-order-details-content">
          {/* Top Fixed Header */}
          <div className="shrink-0 bg-surface px-4 pt-2 pb-3 border-b border-tinta/10">
            <div className="storefront-order-details-drag-handle" aria-hidden="true" />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Dialog.Title className="font-mono text-base font-extrabold text-tinta">
                  Pedido #{details?.orderNumber ?? initialSummary?.orderNumber ?? ''}
                </Dialog.Title>
                {details && (
                  <span
                    className={cn(
                      'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold',
                      details.status === 'DELIVERED' && 'bg-success-light text-success',
                      details.status === 'CANCELLED' && 'bg-error-light text-error',
                      isActive && 'bg-brand-50 text-brand-700 border border-brand-200/50',
                    )}
                  >
                    {details.statusLabel}
                  </span>
                )}
              </div>
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="rounded-full p-1.5 text-text-muted transition-colors hover:bg-tinta/5 hover:text-text-primary"
                  aria-label="Fechar detalhes do pedido"
                >
                  <X className="h-5 w-5" />
                </button>
              </Dialog.Close>
            </div>
          </div>

          {/* Scrollable Content Body */}
          <div className="flex-1 overflow-y-auto px-4 py-5 space-y-6 bg-papel">
            {loading && (
              <div className="space-y-4 py-12 text-center">
                <div className="mx-auto h-7 w-7 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
                <p className="text-xs font-medium text-text-muted">Carregando detalhes...</p>
              </div>
            )}

            {error && (
              <div className="rounded-xl bg-error-light/50 p-4 text-center text-xs text-error">
                Não foi possível carregar todos os detalhes deste pedido.
              </div>
            )}

            {!loading && details && (
              <>
                {/* 1. Status History Timeline */}
                <section className="space-y-3">
                  <h3 className="text-[11px] font-bold uppercase tracking-wider text-text-muted">
                    Histórico do pedido
                  </h3>
                  <div className="relative pl-3 space-y-4">
                    {/* Vertical connecting line */}
                    <div className="absolute left-[17px] top-2 bottom-2 w-0.5 bg-border/60" />

                    {details.events.map((event, idx) => (
                      <div key={event.status + idx} className="relative flex items-center gap-3">
                        <span className="relative z-10 flex h-6 w-6 items-center justify-center rounded-full bg-papel">
                          {event.completed ? (
                            <CheckCircle2 className="h-5 w-5 text-success fill-success/15" />
                          ) : event.current ? (
                            <Circle className="h-5 w-5 fill-brand-600 text-brand-600" />
                          ) : (
                            <Circle className="h-4 w-4 text-border" />
                          )}
                        </span>
                        <div className="flex flex-1 items-center justify-between min-w-0">
                          <span
                            className={cn(
                              'text-xs font-medium text-text-secondary',
                              event.current && 'font-bold text-tinta text-sm',
                            )}
                          >
                            {event.label}
                          </span>
                          <span className="text-[11px] text-text-muted font-mono">
                            {formatEventTime(event.timestamp)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                {/* 2. Order Products List */}
                <section className="space-y-3 pt-2">
                  <h3 className="text-[11px] font-bold uppercase tracking-wider text-text-muted">
                    Itens do pedido
                  </h3>
                  <div className="divide-y divide-tinta/5 rounded-xl border border-tinta/10 bg-surface p-2.5 sm:p-3 shadow-2xs">
                    {details.items.map((item) => (
                      <div key={item.id} className="flex gap-3 py-2.5 first:pt-1 last:pb-1">
                        <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-surface-muted border border-tinta/5">
                          <ProductImage
                            name={item.productName}
                            imageUrl={item.imageUrl ?? null}
                            imageAssetId={item.imageAssetId ?? null}
                            sizes="56px"
                            width={112}
                            fallback={<ShoppingBag className="h-6 w-6 text-text-muted" />}
                          />
                        </div>
                        <div className="flex flex-1 flex-col justify-center min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-xs font-semibold text-tinta leading-tight">
                              {item.quantity}x {item.productName}
                            </span>
                            <span className="font-mono text-xs font-bold text-tinta shrink-0">
                              {formatCurrency(item.itemTotal)}
                            </span>
                          </div>
                          {item.options.length > 0 && (
                            <p className="mt-0.5 text-[11px] text-text-muted leading-tight">
                              {item.options.map((opt) => opt.optionName).join(', ')}
                            </p>
                          )}
                          {item.notes && (
                            <p className="mt-0.5 text-[11px] italic text-text-muted">
                              Obs: {item.notes}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                {/* 3. Payment & Address Summary */}
                <section className="space-y-3 pt-2">
                  <h3 className="text-[11px] font-bold uppercase tracking-wider text-text-muted">
                    Resumo do pagamento
                  </h3>
                  <div className="rounded-xl border border-tinta/10 bg-surface p-3.5 space-y-2 text-xs shadow-2xs">
                    <div className="flex justify-between text-text-muted">
                      <span>Subtotal</span>
                      <span className="font-mono">{formatCurrency(details.subtotal)}</span>
                    </div>
                    {details.deliveryFee > 0 && (
                      <div className="flex justify-between text-text-muted">
                        <span>Taxa de entrega</span>
                        <span className="font-mono">{formatCurrency(details.deliveryFee)}</span>
                      </div>
                    )}
                    {details.discount > 0 && (
                      <div className="flex justify-between text-success font-medium">
                        <span>Desconto</span>
                        <span className="font-mono">-{formatCurrency(details.discount)}</span>
                      </div>
                    )}
                    <div className="flex justify-between border-t border-tinta/5 pt-2 text-sm font-bold text-tinta">
                      <span>Total pago</span>
                      <span className="font-mono">{formatCurrency(details.total)}</span>
                    </div>
                    <div className="pt-2 flex items-center justify-between text-[11px] text-text-muted">
                      <span>Forma de pagamento</span>
                      <span className="font-semibold text-text-primary">
                        {details.paymentMethod}
                      </span>
                    </div>
                  </div>

                  {details.deliveryAddress && (
                    <div className="rounded-xl border border-tinta/10 bg-surface p-3 text-xs flex items-start gap-2 text-text-muted shadow-2xs">
                      <MapPin className="h-4 w-4 shrink-0 text-brand-600 mt-0.5" />
                      <span>{details.deliveryAddress}</span>
                    </div>
                  )}
                </section>
              </>
            )}
          </div>

          {/* Fixed Bottom Footer Actions */}
          <div className="shrink-0 bg-surface p-4 border-t border-tinta/10 flex items-center gap-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {isActive ? (
              <Link
                href={`/${storeSlug}/order/${trackingToken}`}
                className="flex-1 inline-flex h-11 items-center justify-center rounded-xl bg-brand-600 px-4 text-xs sm:text-sm font-bold text-white shadow-sm hover:bg-brand-700 transition-colors"
                onClick={() => onOpenChange(false)}
              >
                Acompanhar em tempo real
              </Link>
            ) : (
              <Button
                type="button"
                onClick={handleReorder}
                disabled={loading || !details}
                className="flex-1 h-11 gap-2 rounded-xl bg-brand-600 text-xs sm:text-sm font-bold text-white shadow-sm hover:bg-brand-700"
              >
                <RotateCcw className="h-4 w-4" />
                Pedir novamente
              </Button>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { CheckCircle2, Circle, MapPin, RotateCcw, ShoppingBag, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { ProductImage } from '@/components/storefront/product-image';
import { Button } from '@/components/ui/button';
import { storeAssetUrl } from '@/features/assets/urls';
import { repeatOrderIntoCart } from '@/features/storefront/repeat-order';
import { cn, formatCurrency } from '@/lib/utils';
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isOptionalString(value: unknown): value is string | null | undefined {
  return value === undefined || value === null || typeof value === 'string';
}

function isOrderEvent(value: unknown) {
  return (
    isRecord(value) &&
    typeof value.status === 'string' &&
    typeof value.label === 'string' &&
    typeof value.timestamp === 'string' &&
    typeof value.completed === 'boolean' &&
    typeof value.current === 'boolean'
  );
}

function isOrderItem(value: unknown) {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    isOptionalString(value.productId) &&
    typeof value.productName === 'string' &&
    isFiniteNumber(value.unitPrice) &&
    isFiniteNumber(value.quantity) &&
    isOptionalString(value.notes) &&
    isFiniteNumber(value.itemTotal) &&
    isOptionalString(value.imageUrl) &&
    isOptionalString(value.imageAssetId) &&
    Array.isArray(value.options) &&
    value.options.every(
      (option) =>
        isRecord(option) &&
        typeof option.optionName === 'string' &&
        isFiniteNumber(option.optionPrice),
    )
  );
}

function isCustomerOrderDetails(value: unknown): value is CustomerOrderDetailsDTO {
  return (
    isRecord(value) &&
    isFiniteNumber(value.orderNumber) &&
    typeof value.status === 'string' &&
    typeof value.statusLabel === 'string' &&
    typeof value.statusChangedAt === 'string' &&
    typeof value.createdAt === 'string' &&
    typeof value.modality === 'string' &&
    typeof value.paymentMethod === 'string' &&
    typeof value.paymentStatus === 'string' &&
    isFiniteNumber(value.subtotal) &&
    isFiniteNumber(value.deliveryFee) &&
    isFiniteNumber(value.discount) &&
    isFiniteNumber(value.total) &&
    isOptionalString(value.deliveryAddress) &&
    Array.isArray(value.events) &&
    value.events.every(isOrderEvent) &&
    Array.isArray(value.items) &&
    value.items.every(isOrderItem)
  );
}

export function OrderDetailsSheet({
  open,
  onOpenChange,
  trackingToken,
  storeId,
  storeSlug,
  initialSummary,
}: OrderDetailsSheetProps) {
  const router = useRouter();
  const [details, setDetails] = useState<CustomerOrderDetailsDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [repeating, setRepeating] = useState(false);

  useEffect(() => {
    if (!open || !trackingToken) return;

    const controller = new AbortController();
    queueMicrotask(() => {
      if (controller.signal.aborted) return;
      setDetails(null);
      setError(false);
      setLoading(true);
    });

    fetch(`/api/orders/details/${trackingToken}?storeSlug=${encodeURIComponent(storeSlug)}`, {
      cache: 'no-store',
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
      .then((res) => {
        if (!res.ok) throw new Error('Falha ao carregar');
        return res.json();
      })
      .then((data: unknown) => {
        if (!isCustomerOrderDetails(data)) {
          throw new Error('Invalid response payload');
        }
        if (controller.signal.aborted) return;
        setDetails(data);
        setLoading(false);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setError(true);
        setLoading(false);
      });

    return () => controller.abort();
  }, [open, trackingToken, storeSlug]);

  const handleReorder = async () => {
    if (!details || details.items.length === 0) return;
    setRepeating(true);
    try {
      const result = await repeatOrderIntoCart({
        storeId,
        storeSlug,
        reference: { trackingToken },
      });
      if (result.addedQuantity > 0) {
        toast.success('Itens disponíveis adicionados com os valores atuais.');
        onOpenChange(false);
        router.push(`/${storeSlug}/cart`);
      }
      if (result.issueCount > 0) {
        toast.warning('Alguns itens mudaram e precisam ser revisados no cardápio.');
      }
    } catch {
      toast.error('Não foi possível revisar este pedido agora.');
    } finally {
      setRepeating(false);
    }
  };

  const isActive =
    details?.status && details.status !== 'DELIVERED' && details.status !== 'CANCELLED';

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="storefront-order-details-overlay" />
        <Dialog.Content className="storefront-order-details-content">
          {/* Top Fixed Header */}
          <div className="bg-surface border-tinta/10 shrink-0 border-b px-4 pt-2 pb-3">
            <div className="storefront-order-details-drag-handle" aria-hidden="true" />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Dialog.Title className="text-tinta font-mono text-base font-extrabold">
                  Pedido #{details?.orderNumber ?? initialSummary?.orderNumber ?? ''}
                </Dialog.Title>
                {details && (
                  <span
                    className={cn(
                      'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold',
                      details.status === 'DELIVERED' && 'bg-success-light text-success',
                      details.status === 'CANCELLED' && 'bg-error-light text-error',
                      isActive && 'storefront-order-details-status-active',
                    )}
                  >
                    {details.statusLabel}
                  </span>
                )}
              </div>
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="text-text-muted hover:bg-tinta/5 hover:text-text-primary inline-flex min-h-11 min-w-11 items-center justify-center rounded-full transition-colors"
                  aria-label="Fechar detalhes do pedido"
                >
                  <X className="h-5 w-5" />
                </button>
              </Dialog.Close>
            </div>
          </div>

          {/* Scrollable Content Body */}
          <div className="bg-papel flex-1 space-y-6 overflow-y-auto px-4 py-5">
            {loading && (
              <div className="space-y-4 py-12 text-center">
                <div className="border-brand-600 mx-auto h-7 w-7 animate-spin rounded-full border-2 border-t-transparent" />
                <p className="text-text-muted text-xs font-medium">Carregando detalhes...</p>
              </div>
            )}

            {error && (
              <div className="bg-error-light/50 text-error rounded-xl p-4 text-center text-xs">
                Não foi possível carregar todos os detalhes deste pedido.
              </div>
            )}

            {!loading && details && (
              <>
                {/* 1. Status History Timeline */}
                <section className="space-y-3">
                  <h3 className="text-text-muted text-sm font-bold tracking-wide uppercase">
                    Histórico do pedido
                  </h3>
                  <div className="relative space-y-4 pl-3">
                    {/* Vertical connecting line */}
                    <div className="bg-border/60 absolute top-2 bottom-2 left-[17px] w-0.5" />

                    {details.events.map((event, idx) => (
                      <div key={event.status + idx} className="relative flex items-center gap-3">
                        <span className="bg-papel relative z-10 flex h-6 w-6 items-center justify-center rounded-full">
                          {event.completed ? (
                            <CheckCircle2 className="text-success fill-success/15 h-5 w-5" />
                          ) : event.current ? (
                            <Circle className="storefront-order-details-current-step h-5 w-5" />
                          ) : (
                            <Circle className="text-border h-4 w-4" />
                          )}
                        </span>
                        <div className="flex min-w-0 flex-1 items-center justify-between">
                          <span
                            className={cn(
                              'text-text-secondary text-xs font-medium',
                              event.current && 'text-tinta text-sm font-bold',
                            )}
                          >
                            {event.label}
                          </span>
                          <span className="text-text-muted font-mono text-sm">
                            {formatEventTime(event.timestamp)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                {/* 2. Order Products List */}
                <section className="space-y-3 pt-2">
                  <h3 className="text-text-muted text-sm font-bold tracking-wide uppercase">
                    Itens do pedido
                  </h3>
                  <div className="divide-tinta/5 border-tinta/10 bg-surface divide-y rounded-xl border p-2.5 shadow-2xs sm:p-3">
                    {details.items.map((item) => (
                      <div key={item.id} className="flex gap-3 py-2.5 first:pt-1 last:pb-1">
                        <div className="bg-surface-muted border-tinta/5 relative h-14 w-14 shrink-0 overflow-hidden rounded-xl border">
                          <ProductImage
                            name={item.productName}
                            // O detalhe recebe imageAssetId como identificador, mas esta
                            // superfície deve consumir uma URL pública determinística.
                            // Evitamos depender do loader customizado do next/image no
                            // sheet e também evitamos que um UUID seja tratado como rota.
                            imageUrl={
                              item.imageUrl ??
                              (item.imageAssetId ? storeAssetUrl(item.imageAssetId, 256) : null)
                            }
                            imageAssetId={null}
                            sizes="56px"
                            width={112}
                            fallback={<ShoppingBag className="text-text-muted h-6 w-6" />}
                          />
                        </div>
                        <div className="flex min-w-0 flex-1 flex-col justify-center">
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-tinta text-xs leading-tight font-semibold">
                              {item.quantity}x {item.productName}
                            </span>
                            <span className="text-tinta shrink-0 font-mono text-xs font-bold">
                              {formatCurrency(item.itemTotal)}
                            </span>
                          </div>
                          {item.options.length > 0 && (
                            <p className="text-text-muted mt-0.5 text-sm leading-tight">
                              {item.options.map((opt) => opt.optionName).join(', ')}
                            </p>
                          )}
                          {item.notes && (
                            <p className="text-text-muted mt-0.5 text-sm italic">
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
                  <h3 className="text-text-muted text-sm font-bold tracking-wide uppercase">
                    Resumo do pagamento
                  </h3>
                  <div className="border-tinta/10 bg-surface space-y-2 rounded-xl border p-3.5 text-xs shadow-2xs">
                    <div className="text-text-muted flex justify-between">
                      <span>Subtotal</span>
                      <span className="font-mono">{formatCurrency(details.subtotal)}</span>
                    </div>
                    {details.deliveryFee > 0 && (
                      <div className="text-text-muted flex justify-between">
                        <span>Taxa de entrega</span>
                        <span className="font-mono">{formatCurrency(details.deliveryFee)}</span>
                      </div>
                    )}
                    {details.discount > 0 && (
                      <div className="text-success flex justify-between font-medium">
                        <span>Desconto</span>
                        <span className="font-mono">-{formatCurrency(details.discount)}</span>
                      </div>
                    )}
                    <div className="border-tinta/5 text-tinta flex justify-between border-t pt-2 text-sm font-bold">
                      <span>Total pago</span>
                      <span className="font-mono">{formatCurrency(details.total)}</span>
                    </div>
                    <div className="text-text-muted flex items-center justify-between pt-2 text-sm">
                      <span>Forma de pagamento</span>
                      <span className="text-text-primary font-semibold">
                        {details.paymentMethod}
                      </span>
                    </div>
                  </div>

                  {details.deliveryAddress && (
                    <div className="border-tinta/10 bg-surface text-text-muted flex items-start gap-2 rounded-xl border p-3 text-xs shadow-2xs">
                      <MapPin className="storefront-order-details-accent mt-0.5 h-4 w-4 shrink-0" />
                      <span>{details.deliveryAddress}</span>
                    </div>
                  )}
                </section>
              </>
            )}
          </div>

          {/* Fixed Bottom Footer Actions */}
          <div className="bg-surface border-tinta/10 flex shrink-0 items-center gap-2 border-t p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {isActive ? (
              <Link
                href={`/${storeSlug}/order/${trackingToken}`}
                className="storefront-order-details-primary inline-flex min-h-11 flex-1 items-center justify-center rounded-xl px-4 text-sm font-bold shadow-sm transition-colors"
                onClick={() => onOpenChange(false)}
              >
                Acompanhar em tempo real
              </Link>
            ) : (
              <Button
                type="button"
                onClick={() => void handleReorder()}
                disabled={loading || !details || repeating}
                className="storefront-order-details-primary min-h-11 flex-1 gap-2 rounded-xl text-sm font-bold shadow-sm"
              >
                <RotateCcw className="h-4 w-4" />
                {repeating ? 'Revisando…' : 'Pedir novamente'}
              </Button>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

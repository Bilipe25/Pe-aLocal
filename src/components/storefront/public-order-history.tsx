'use client';

import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  Package,
  RefreshCw,
  RotateCcw,
  ShoppingBag,
  Trash2,
  Truck,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { OrderStatus } from '@prisma/client';

import { Button } from '@/components/ui/button';
import { cn, formatCurrency } from '@/lib/utils';
import { useCartStore } from '@/stores/cart-store';
import {
  subscribeToPublicOrderHistoryStorage,
  usePublicOrderHistoryStore,
  type PublicOrderHistoryRecord,
} from '@/stores/public-order-history-store';
import type { CustomerOrderTrackingStateDTO } from '@/types/order-tracking';

const statusPresentation: Record<
  OrderStatus,
  { label: string; icon: LucideIcon; tone: 'info' | 'success' | 'warning' | 'error' }
> = {
  PENDING: { label: 'Recebido', icon: Clock3, tone: 'info' },
  AWAITING_PAYMENT: { label: 'Aguardando pagamento', icon: Clock3, tone: 'warning' },
  CONFIRMED: { label: 'Confirmado', icon: CheckCircle2, tone: 'info' },
  PREPARING: { label: 'Em preparo', icon: Package, tone: 'info' },
  READY: { label: 'Pronto', icon: CheckCircle2, tone: 'success' },
  OUT_FOR_DELIVERY: { label: 'Em entrega', icon: Truck, tone: 'info' },
  DELIVERED: { label: 'Concluído', icon: CheckCircle2, tone: 'success' },
  CANCELLED: { label: 'Cancelado', icon: XCircle, tone: 'error' },
};

interface PublicOrderHistoryProps {
  storeId: string;
  storeSlug: string;
}

type HistoryItem =
  | { record: PublicOrderHistoryRecord; status: 'loading' }
  | {
      record: PublicOrderHistoryRecord;
      status: 'success';
      tracking: CustomerOrderTrackingStateDTO;
    }
  | { record: PublicOrderHistoryRecord; status: 'error'; message: string };

function isTrackingState(value: unknown): value is CustomerOrderTrackingStateDTO {
  if (!value || typeof value !== 'object') return false;
  const state = value as Record<string, unknown>;
  const estimate = state.estimate;

  return (
    typeof state.orderNumber === 'number' &&
    typeof state.modality === 'string' &&
    typeof state.status === 'string' &&
    Object.hasOwn(statusPresentation, state.status) &&
    typeof state.paymentStatus === 'string' &&
    typeof state.version === 'number' &&
    typeof state.statusChangedAt === 'string' &&
    typeof state.updatedAt === 'string' &&
    (estimate === null ||
      (typeof estimate === 'object' &&
        estimate !== null &&
        'label' in estimate &&
        typeof estimate.label === 'string' &&
        'minAt' in estimate &&
        typeof estimate.minAt === 'string' &&
        'maxAt' in estimate &&
        typeof estimate.maxAt === 'string'))
  );
}

function formatOrderDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Data indisponível';

  try {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: 'short',
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: 'short',
    }).format(date);
  }
}

async function loadTracking(record: PublicOrderHistoryRecord, storeSlug: string) {
  const response = await fetch(
    `/api/orders/track/${encodeURIComponent(record.trackingToken)}?storeSlug=${encodeURIComponent(storeSlug)}`,
    {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    },
  );

  if ([400, 404, 410].includes(response.status)) {
    return { status: 'expired' as const };
  }
  if (!response.ok) {
    return { status: 'error' as const, message: 'Não foi possível atualizar este pedido.' };
  }

  const payload: unknown = await response.json();
  if (!isTrackingState(payload)) {
    return { status: 'error' as const, message: 'Resposta inválida do acompanhamento.' };
  }
  return { status: 'success' as const, tracking: payload };
}

export function PublicOrderHistory({ storeId, storeSlug }: PublicOrderHistoryProps) {
  const router = useRouter();
  const orders = usePublicOrderHistoryStore((state) => state.orders);
  const setStore = usePublicOrderHistoryStore((state) => state.setStore);
  const removeOrder = usePublicOrderHistoryStore((state) => state.removeOrder);
  const clearOrders = usePublicOrderHistoryStore((state) => state.clearOrders);
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [statusMessage, setStatusMessage] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  const handleReorder = (orderItems?: CustomerOrderTrackingStateDTO['items']) => {
    if (!orderItems || orderItems.length === 0) {
      router.push(`/${storeSlug}`);
      return;
    }

    useCartStore.getState().setStore(storeId, storeSlug);

    let addedCount = 0;
    for (const item of orderItems) {
      useCartStore.getState().addItem({
        productId: item.productId ?? '',
        productName: item.productName,
        basePrice: item.unitPrice,
        unitPrice: item.unitPrice,
        quantity: item.quantity,
        notes: '',
        selectedOptions: [],
      });
      addedCount += item.quantity;
    }

    toast.success(
      `${addedCount} ${addedCount === 1 ? 'item adicionado' : 'itens adicionados'} à sua sacola!`,
    );
    router.push(`/${storeSlug}`);
  };

  useEffect(() => {
    setStore(storeId, storeSlug);
    return subscribeToPublicOrderHistoryStorage(storeId, storeSlug);
  }, [setStore, storeId, storeSlug]);

  useEffect(() => {
    if (orders.length === 0) {
      return;
    }

    let active = true;
    queueMicrotask(() => {
      if (active) setItems(orders.map((record) => ({ record, status: 'loading' })));
    });

    const load = async () => {
      const results = await Promise.all(
        orders.map(async (record): Promise<HistoryItem | null> => {
          try {
            const result = await loadTracking(record, storeSlug);
            if (result.status === 'expired') {
              if (active) removeOrder(record.trackingToken);
              return null;
            }
            if (result.status === 'error') {
              return { record, status: 'error', message: result.message };
            }
            return { record, status: 'success', tracking: result.tracking };
          } catch {
            return {
              record,
              status: 'error',
              message: 'Verifique sua conexão e tente atualizar novamente.',
            };
          }
        }),
      );

      if (active) setItems(results.filter((item): item is HistoryItem => item !== null));
    };

    void load();
    return () => {
      active = false;
    };
  }, [orders, reloadKey, removeOrder, storeSlug]);

  const visibleItems = useMemo(
    () =>
      items.filter((item) =>
        orders.some((order) => order.trackingToken === item.record.trackingToken),
      ),
    [items, orders],
  );

  if (orders.length === 0) {
    return (
      <section className="storefront-public-order-history is-empty">
        <div className="storefront-public-order-history-empty">
          <span className="storefront-public-order-history-empty-icon" aria-hidden="true">
            <ShoppingBag />
          </span>
          <h2>Nenhum pedido por aqui ainda</h2>
          <p>
            Quando você fizer um pedido, ele aparecerá aqui para você acompanhar.
          </p>
          <Link
            href={`/${storeSlug}`}
            className="storefront-primary-action storefront-public-order-history-cta"
          >
            Ir para o cardápio
          </Link>
        </div>
        {statusMessage && (
          <p className="sr-only" role="status" aria-live="polite">
            {statusMessage}
          </p>
        )}
      </section>
    );
  }

  return (
    <section
      className="storefront-public-order-history"
      aria-labelledby="storefront-public-order-history-title"
      data-order-history-count={visibleItems.length}
    >
      <div className="storefront-public-order-history-header">
        <div>
          <h2 id="storefront-public-order-history-title" className="hidden sm:block">
            Seus pedidos
          </h2>
          <p className="hidden sm:block">Acompanhe o andamento dos seus pedidos recentes.</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            clearOrders();
            setStatusMessage('Pedidos lembrados removidos deste aparelho.');
          }}
          aria-label="Limpar pedidos lembrados"
        >
          <Trash2 className="h-4 w-4 text-text-muted group-hover:text-error transition-colors" aria-hidden="true" />
          <span className="text-xs font-medium">Limpar histórico</span>
        </Button>
      </div>

      <ul className="storefront-public-order-history-list">
        {visibleItems.length === 0 && items.length === 0 && (
          <li className="storefront-public-order-history-item is-loading" aria-busy="true">
            <span className="storefront-public-order-history-icon" aria-hidden="true">
              <RefreshCw />
            </span>
            <span>Atualizando pedidos…</span>
          </li>
        )}
        {visibleItems.map((item) => {
          const orderKey = item.record.trackingToken;
          if (item.status === 'loading') {
            return (
              <li
                key={orderKey}
                className="storefront-public-order-history-item is-loading"
                aria-busy="true"
              >
                <span className="storefront-public-order-history-icon" aria-hidden="true">
                  <RefreshCw />
                </span>
                <span>Atualizando pedido…</span>
              </li>
            );
          }

          if (item.status === 'error') {
            return (
              <li key={orderKey} className="storefront-public-order-history-item is-error">
                <span className="storefront-public-order-history-icon" aria-hidden="true">
                  <AlertCircle />
                </span>
                <span className="storefront-public-order-history-details">
                  <strong>Pedido lembrado</strong>
                  <span>{item.message}</span>
                </span>
                <span className="storefront-public-order-history-error-actions">
                  <button
                    type="button"
                    className="storefront-public-order-history-retry"
                    onClick={() => setReloadKey((current) => current + 1)}
                  >
                    Tentar novamente
                  </button>
                  <button
                    type="button"
                    className="storefront-public-order-history-remove"
                    onClick={() => removeOrder(item.record.trackingToken)}
                    aria-label="Remover pedido lembrado"
                  >
                    Remover
                  </button>
                </span>
              </li>
            );
          }

          const presentation = statusPresentation[item.tracking.status];
          const StatusIcon = presentation.icon;
          const isActive =
            item.tracking.status !== 'DELIVERED' && item.tracking.status !== 'CANCELLED';

          return (
            <li
              key={orderKey}
              className={cn(
                'storefront-public-order-history-item',
                isActive && 'is-active',
              )}
            >
              <span
                className={`storefront-public-order-history-icon is-${isActive ? 'active' : presentation.tone}`}
                aria-hidden="true"
              >
                <StatusIcon />
              </span>
              <span className="storefront-public-order-history-details">
                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                  <strong>Pedido #{item.tracking.orderNumber}</strong>
                  <span
                    className={`storefront-public-order-history-badge is-${isActive ? 'active' : presentation.tone}`}
                  >
                    {presentation.label}
                  </span>
                </div>
                {item.tracking.itemsSummary && (
                  <span className="text-text-primary text-xs font-medium truncate max-w-[200px] sm:max-w-[260px]">
                    {item.tracking.itemsSummary}
                  </span>
                )}
                <span className="text-text-muted text-[11px]">
                  {formatOrderDate(item.record.createdAt)} ·{' '}
                  {item.tracking.modality === 'DELIVERY' ? 'Entrega' : 'Retirada'}
                  {item.tracking.totalCents ? ` · ${formatCurrency(item.tracking.totalCents)}` : ''}
                </span>
              </span>
              {item.tracking.status === 'DELIVERED' ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleReorder(item.tracking.items)}
                  className="h-9 gap-1 px-2.5 text-xs font-bold text-brand-600 border-brand-500/20 hover:bg-brand-50 hover:text-brand-700"
                  aria-label={`Pedir novamente o pedido ${item.tracking.orderNumber}`}
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  Pedir de novo
                </Button>
              ) : (
                <Link
                  href={`/${storeSlug}/order/${item.record.trackingToken}`}
                  className={cn(
                    'storefront-public-order-history-link',
                    isActive && 'is-active',
                  )}
                  aria-label={`Acompanhar pedido ${item.tracking.orderNumber}`}
                >
                  {isActive ? 'Acompanhar' : 'Ver pedido'}
                </Link>
              )}
            </li>
          );
        })}
      </ul>

      <p className="sr-only" role="status" aria-live="polite">
        {statusMessage}
      </p>
    </section>
  );
}

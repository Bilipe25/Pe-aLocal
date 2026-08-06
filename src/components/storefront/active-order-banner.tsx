'use client';

import type { OrderStatus } from '@prisma/client';
import {
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  Package,
  Truck,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { useCustomerOrderTracking } from '@/hooks/use-customer-order-tracking';
import { privateCustomerOrderChannel } from '@/lib/pusher/customer-channel';
import { useLastOrderStore } from '@/stores/last-order-store';
import type { CustomerOrderTrackingStateDTO } from '@/types/order-tracking';

type ActiveOrderStatus = Exclude<OrderStatus, 'DELIVERED' | 'CANCELLED'>;

const statusPresentation: Record<
  ActiveOrderStatus,
  { label: string; description: string; icon: LucideIcon }
> = {
  PENDING: {
    label: 'Pedido recebido',
    description: 'A loja recebeu seu pedido.',
    icon: Clock3,
  },
  AWAITING_PAYMENT: {
    label: 'Aguardando pagamento',
    description: 'O pedido aguarda a confirmação do pagamento.',
    icon: Clock3,
  },
  CONFIRMED: {
    label: 'Pedido confirmado',
    description: 'A loja confirmou o pedido.',
    icon: CheckCircle2,
  },
  PREPARING: {
    label: 'Em preparo',
    description: 'Seu pedido está sendo preparado.',
    icon: Package,
  },
  READY: {
    label: 'Pedido pronto',
    description: 'Seu pedido está pronto para a próxima etapa.',
    icon: CheckCircle2,
  },
  OUT_FOR_DELIVERY: {
    label: 'Saiu para entrega',
    description: 'Seu pedido está a caminho.',
    icon: Truck,
  },
};

function isTrackingState(value: unknown): value is CustomerOrderTrackingStateDTO {
  if (!value || typeof value !== 'object') return false;
  const state = value as Record<string, unknown>;
  const estimate = state.estimate;
  return (
    typeof state.orderNumber === 'number' &&
    typeof state.modality === 'string' &&
    typeof state.status === 'string' &&
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

function isActiveOrderStatus(status: OrderStatus): status is ActiveOrderStatus {
  return status in statusPresentation && status !== 'DELIVERED' && status !== 'CANCELLED';
}

function formatEstimateWindow(minAt: string, maxAt: string, timeZone: string) {
  const minDate = new Date(minAt);
  const maxDate = new Date(maxAt);
  if (!Number.isFinite(minDate.getTime()) || !Number.isFinite(maxDate.getTime())) return null;

  try {
    const formatter = new Intl.DateTimeFormat('pt-BR', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
    });
    return `${formatter.format(minDate)}–${formatter.format(maxDate)}`;
  } catch {
    const formatter = new Intl.DateTimeFormat('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    });
    return `${formatter.format(minDate)}–${formatter.format(maxDate)}`;
  }
}

const statusTone: Record<ActiveOrderStatus, 'info' | 'success' | 'accent'> = {
  PENDING: 'info',
  AWAITING_PAYMENT: 'info',
  CONFIRMED: 'success',
  PREPARING: 'accent',
  READY: 'success',
  OUT_FOR_DELIVERY: 'success',
};

interface ActiveOrderBannerProps {
  storeId: string;
  storeSlug: string;
  timeZone?: string;
}

export function ActiveOrderBanner({
  storeId,
  storeSlug,
  timeZone = 'America/Fortaleza',
}: ActiveOrderBannerProps) {
  const record = useLastOrderStore((state) => state.record);
  const setStore = useLastOrderStore((state) => state.setStore);
  const clearOrder = useLastOrderStore((state) => state.clearOrder);
  const [access, setAccess] = useState<{
    publicToken: string;
    initialState: CustomerOrderTrackingStateDTO;
    channelName: string;
  } | null>(null);

  useEffect(() => {
    setStore(storeId, storeSlug);
  }, [setStore, storeId, storeSlug]);

  const trackingToken =
    record?.storeId === storeId && record.storeSlug === storeSlug ? record.trackingToken : null;

  useEffect(() => {
    if (!trackingToken) {
      return;
    }

    let active = true;

    const load = async () => {
      try {
        const response = await fetch(
          `/api/orders/track/${encodeURIComponent(trackingToken)}?storeSlug=${encodeURIComponent(storeSlug)}`,
          { cache: 'no-store', headers: { Accept: 'application/json' } },
        );
        if (!response.ok) {
          if ([400, 404, 410].includes(response.status)) clearOrder();
          return;
        }

        const payload: unknown = await response.json();
        if (!isTrackingState(payload)) return;

        let channelName = '';
        if (process.env.NEXT_PUBLIC_PUSHER_KEY && process.env.NEXT_PUBLIC_PUSHER_CLUSTER) {
          try {
            channelName = await privateCustomerOrderChannel(trackingToken);
          } catch {
            // O polling de segurança continua disponível sem o canal em tempo real.
          }
        }

        if (active) setAccess({ publicToken: trackingToken, initialState: payload, channelName });
      } catch {
        // O banner é informativo; uma falha de rede não deve ocupar o carrinho.
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, [clearOrder, storeSlug, trackingToken]);

  const visibleAccess = access?.publicToken === trackingToken ? access : null;
  if (!visibleAccess) return null;

  return (
    <ActiveOrderBannerLive
      key={visibleAccess.publicToken}
      publicToken={visibleAccess.publicToken}
      initialState={visibleAccess.initialState}
      channelName={visibleAccess.channelName}
      storeSlug={storeSlug}
      timeZone={timeZone}
      onExpired={clearOrder}
    />
  );
}

function ActiveOrderBannerLive({
  publicToken,
  initialState,
  channelName,
  storeSlug,
  timeZone,
  onExpired,
}: {
  publicToken: string;
  initialState: CustomerOrderTrackingStateDTO;
  channelName: string;
  storeSlug: string;
  timeZone: string;
  onExpired: () => void;
}) {
  const tracking = useCustomerOrderTracking({
    publicToken,
    storeSlug,
    channelName,
    initialState,
    onExpired,
  });

  if (!tracking.state || !isActiveOrderStatus(tracking.state.status)) return null;

  const state = tracking.state;
  const activeStatus = state.status as ActiveOrderStatus;
  const presentation = statusPresentation[activeStatus];
  const StatusIcon = presentation.icon;
  const estimate = state.estimate
    ? formatEstimateWindow(state.estimate.minAt, state.estimate.maxAt, timeZone)
    : null;

  return (
    <aside
      className={`storefront-active-order-banner is-${statusTone[activeStatus]}`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      data-order-status={state.status}
    >
      <span className="storefront-active-order-icon" aria-hidden="true">
        <StatusIcon />
      </span>
      <div className="storefront-active-order-copy">
        <span className="storefront-active-order-label">{presentation.label}</span>
        <strong>Pedido #{state.orderNumber}</strong>
        {estimate && (
          <p className="storefront-active-order-estimate">
            {state.estimate?.label}: {estimate}
          </p>
        )}
      </div>
      <Link
        href={`/${storeSlug}/order/${publicToken}`}
        className="storefront-active-order-link"
        aria-label={`Acompanhar pedido ${state.orderNumber}`}
      >
        <span>Acompanhar</span>
        <ArrowUpRight aria-hidden="true" />
      </Link>
    </aside>
  );
}

'use client';

import {
  CheckCircle2,
  Circle,
  Clock3,
  Package,
  RefreshCw,
  Truck,
  Wifi,
  WifiOff,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import type { OrderStatus } from '@prisma/client';

import { Button } from '@/components/ui/button';
import {
  useCustomerOrderTracking,
  type CustomerTrackingConnection,
} from '@/hooks/use-customer-order-tracking';
import { cn } from '@/lib/utils';
import type { CustomerOrderTrackingStateDTO } from '@/types/order-tracking';

const statusPresentation: Record<
  OrderStatus,
  { label: string; description: string; icon: LucideIcon; className: string }
> = {
  PENDING: {
    label: 'Pedido recebido',
    description: 'A loja recebeu seu pedido e fará a conferência.',
    icon: Clock3,
    className: 'bg-warning-light text-warning',
  },
  AWAITING_PAYMENT: {
    label: 'Aguardando pagamento',
    description: 'Conclua ou informe o pagamento para continuar.',
    icon: Clock3,
    className: 'bg-warning-light text-warning',
  },
  CONFIRMED: {
    label: 'Pedido confirmado',
    description: 'A loja confirmou e vai iniciar o preparo.',
    icon: CheckCircle2,
    className: 'bg-info-light text-info',
  },
  PREPARING: {
    label: 'Em preparo',
    description: 'Seu pedido está sendo preparado.',
    icon: Package,
    className: 'bg-info-light text-info',
  },
  READY: {
    label: 'Pedido pronto',
    description: 'Seu pedido está pronto para a próxima etapa.',
    icon: CheckCircle2,
    className: 'bg-success-light text-success',
  },
  OUT_FOR_DELIVERY: {
    label: 'Saiu para entrega',
    description: 'Seu pedido está a caminho.',
    icon: Truck,
    className: 'bg-info-light text-info',
  },
  DELIVERED: {
    label: 'Pedido concluído',
    description: 'O pedido foi entregue ou retirado.',
    icon: CheckCircle2,
    className: 'bg-success-light text-success',
  },
  CANCELLED: {
    label: 'Pedido cancelado',
    description: 'Este pedido não seguirá para as próximas etapas.',
    icon: XCircle,
    className: 'bg-error-light text-error',
  },
};

const connectionPresentation: Record<
  CustomerTrackingConnection,
  { label: string; icon: LucideIcon; className: string }
> = {
  connected: { label: 'Atualizações ao vivo', icon: Wifi, className: 'text-success' },
  connecting: { label: 'Conectando…', icon: Wifi, className: 'text-info' },
  degraded: { label: 'Atualização automática', icon: RefreshCw, className: 'text-warning' },
  unavailable: { label: 'Atualização automática', icon: WifiOff, className: 'text-text-secondary' },
};

function formatTime(value: string, timeZone: string, withSeconds = false) {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    second: withSeconds ? '2-digit' : undefined,
  }).format(new Date(value));
}

function steps(modality: CustomerOrderTrackingStateDTO['modality']) {
  const base: Array<{ status: OrderStatus; label: string }> = [
    { status: 'PENDING', label: 'Recebido' },
    { status: 'CONFIRMED', label: 'Confirmado' },
    { status: 'PREPARING', label: 'Em preparo' },
    { status: 'READY', label: 'Pronto' },
  ];
  if (modality === 'DELIVERY') base.push({ status: 'OUT_FOR_DELIVERY', label: 'Em entrega' });
  base.push({ status: 'DELIVERED', label: 'Concluído' });
  return base;
}

export function CustomerOrderTracking({
  publicToken,
  storeSlug,
  channelName,
  timeZone,
  initialState,
}: {
  publicToken: string;
  storeSlug: string;
  channelName: string;
  timeZone: string;
  initialState: CustomerOrderTrackingStateDTO;
}) {
  const tracking = useCustomerOrderTracking({
    publicToken,
    storeSlug,
    channelName,
    initialState,
  });
  const state = tracking.state;
  const presentation = statusPresentation[state.status];
  const StatusIcon = presentation.icon;
  const connection = connectionPresentation[tracking.connection];
  const ConnectionIcon = connection.icon;
  const timeline = steps(state.modality);
  const currentIndex =
    state.status === 'AWAITING_PAYMENT'
      ? 0
      : timeline.findIndex((step) => step.status === state.status);
  const statusDescription =
    state.status === 'READY'
      ? state.modality === 'PICKUP'
        ? 'Seu pedido está pronto para retirada.'
        : 'Seu pedido está pronto e aguarda a saída para entrega.'
      : presentation.description;

  return (
    <section className="border-tinta/10 bg-papel rounded-xl border p-4 sm:p-5" aria-live="polite">
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-full',
            presentation.className,
          )}
        >
          <StatusIcon aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-text-secondary font-mono text-sm font-bold">
            Pedido #{state.orderNumber}
          </p>
          <h2 className="font-display text-tinta mt-0.5 text-xl font-bold">{presentation.label}</h2>
          <p className="text-text-secondary mt-1 text-sm">{statusDescription}</p>
          {state.estimate && (
            <p className="text-tinta mt-2 text-sm font-medium">
              {state.estimate.label}: {formatTime(state.estimate.minAt, timeZone)}–
              {formatTime(state.estimate.maxAt, timeZone)}
            </p>
          )}
        </div>
      </div>

      {state.status === 'CANCELLED' ? (
        <div className="bg-error-light text-error mt-4 rounded-lg px-3 py-3 text-sm" role="status">
          {state.cancellationMessage}
        </div>
      ) : (
        <ol className="mt-5 flex items-start" aria-label="Etapas do pedido">
          {timeline.map((step, index) => {
            const complete = currentIndex >= 0 && index < currentIndex;
            const current = index === currentIndex;
            return (
              <li
                key={step.status}
                className="relative flex min-w-0 flex-1 flex-col items-center text-center"
              >
                {index > 0 && (
                  <span
                    className={cn(
                      'bg-border absolute top-2.5 right-1/2 h-0.5 w-full',
                      (complete || current) && 'bg-success',
                    )}
                    aria-hidden="true"
                  />
                )}
                <span className="bg-papel relative z-10 px-1">
                  {complete ? (
                    <CheckCircle2 className="text-success" aria-hidden="true" />
                  ) : current ? (
                    <Circle className="fill-brand-600 text-brand-600" aria-hidden="true" />
                  ) : (
                    <Circle className="text-border" aria-hidden="true" />
                  )}
                </span>
                <span
                  className={cn(
                    'text-text-secondary mt-1.5 text-sm leading-tight',
                    current && 'text-tinta font-semibold',
                  )}
                  aria-current={current ? 'step' : undefined}
                >
                  {step.label}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      <div className="border-tinta/10 mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-3">
        <div className="text-text-secondary text-xs">
          <span
            className={cn('inline-flex items-center gap-1.5 font-medium', connection.className)}
          >
            <ConnectionIcon aria-hidden="true" /> {connection.label}
          </span>
          <span className="mt-1 block">
            Atualizado às {formatTime(tracking.lastSynchronizedAt, timeZone, true)}
          </span>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void tracking.refresh()}
          disabled={tracking.isRefreshing}
        >
          <RefreshCw
            className={tracking.isRefreshing ? 'animate-spin' : undefined}
            aria-hidden="true"
          />
          {tracking.isRefreshing ? 'Atualizando…' : 'Atualizar'}
        </Button>
      </div>
      {tracking.error && (
        <p
          className="bg-warning-light text-warning mt-3 rounded-lg px-3 py-2 text-sm"
          role="status"
        >
          {tracking.error}
        </p>
      )}
    </section>
  );
}

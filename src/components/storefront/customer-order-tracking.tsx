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

import {
  ExpiredOrderAccess,
  useExpireCustomerOrderAccess,
} from '@/components/storefront/customer-order-access-boundary';
import { Button } from '@/components/ui/button';
import {
  useCustomerOrderTracking,
  type CustomerTrackingConnection,
} from '@/hooks/use-customer-order-tracking';
import { cn } from '@/lib/utils';
import type { CustomerOrderTrackingStateDTO } from '@/types/order-tracking';
import { OrderPushSubscription } from '@/components/pwa/order-push-subscription';

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
  publicVapidKey,
  automaticPayment = false,
}: {
  publicToken: string;
  storeSlug: string;
  channelName: string;
  timeZone: string;
  initialState: CustomerOrderTrackingStateDTO;
  publicVapidKey?: string | null;
  automaticPayment?: boolean;
}) {
  const expireCustomerOrderAccess = useExpireCustomerOrderAccess();
  const tracking = useCustomerOrderTracking({
    publicToken,
    storeSlug,
    channelName,
    initialState,
    onExpired: expireCustomerOrderAccess,
  });

  if (tracking.expired || !tracking.state) {
    return <ExpiredOrderAccess storeSlug={storeSlug} />;
  }

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
    state.status === 'AWAITING_PAYMENT' && automaticPayment
      ? 'Conclua o Pix. A confirmação será feita automaticamente.'
      : state.status === 'READY'
        ? state.modality === 'PICKUP'
          ? 'Seu pedido está pronto para retirada.'
          : 'Seu pedido está pronto e aguarda a saída para entrega.'
        : presentation.description;

  return (
    <section className="border-tinta/10 bg-papel rounded-2xl border p-4.5 shadow-sm sm:p-5">
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {presentation.label}. {statusDescription}
      </p>
      <div className="flex items-start gap-3.5">
        <div
          className={cn(
            'flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl shadow-2xs',
            presentation.className,
          )}
        >
          <StatusIcon className="h-6 w-6" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-tinta text-xl font-extrabold tracking-tight">
            {presentation.label}
          </h2>
          <p className="text-text-secondary mt-1 text-xs leading-relaxed sm:text-sm">
            {statusDescription}
          </p>
          {state.estimate && (
            <div className="bg-brand-50/80 text-brand-700 border-brand-200/50 mt-3 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold shadow-2xs">
              <Clock3 className="text-brand-600 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>
                {state.estimate.label}: {formatTime(state.estimate.minAt, timeZone)}–
                {formatTime(state.estimate.maxAt, timeZone)}
              </span>
            </div>
          )}
        </div>
      </div>

      {state.status === 'CANCELLED' ? (
        <div
          className="bg-error-light text-error mt-4 rounded-xl px-3.5 py-3 text-sm font-medium"
          role="status"
        >
          {state.cancellationMessage}
        </div>
      ) : (
        <ol className="mt-6 flex items-start" aria-label="Etapas do pedido">
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
                    <CheckCircle2
                      className="text-success fill-success/15 h-5 w-5"
                      aria-hidden="true"
                    />
                  ) : current ? (
                    <Circle className="fill-brand-600 text-brand-600 h-5 w-5" aria-hidden="true" />
                  ) : (
                    <Circle className="text-border h-5 w-5" aria-hidden="true" />
                  )}
                </span>
                <span
                  className={cn(
                    'text-text-secondary mt-1.5 w-full min-w-0 px-0.5 text-center text-[10px] leading-tight break-words sm:text-xs',
                    current && 'text-tinta font-bold',
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

      <OrderPushSubscription
        publicToken={publicToken}
        storeSlug={storeSlug}
        publicVapidKey={publicVapidKey}
        status={state.status}
      />

      <div className="border-tinta/10 mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-3.5">
        <div className="text-text-secondary text-xs">
          <span
            className={cn('inline-flex items-center gap-1.5 font-semibold', connection.className)}
          >
            <ConnectionIcon className="h-3.5 w-3.5" aria-hidden="true" /> {connection.label}
          </span>
          <span className="text-text-muted mt-0.5 block text-[11px]">
            Atualizado às {formatTime(tracking.lastSynchronizedAt, timeZone, true)}
          </span>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void tracking.refresh()}
          disabled={tracking.isRefreshing}
          className="h-8 gap-1.5 px-3 text-xs font-semibold"
        >
          <RefreshCw
            className={cn('h-3.5 w-3.5', tracking.isRefreshing && 'animate-spin')}
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

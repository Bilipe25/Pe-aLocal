'use client';

import { CircleAlert, Clock3, TriangleAlert } from 'lucide-react';
import { useSyncExternalStore } from 'react';

import {
  getOrderOperationalSlaElapsedSeconds,
  getOrderOperationalSlaStage,
} from '@/domain/orders/operational-sla';
import { cn } from '@/lib/utils';
import type { OrderOperationalSlaConfigDTO } from '@/types/order-query';

let secondSnapshot = 0;
let secondInterval: number | null = null;
const secondListeners = new Set<() => void>();

function emitSecond() {
  secondSnapshot = Date.now();
  secondListeners.forEach((listener) => listener());
}

function subscribeToSecond(listener: () => void) {
  secondListeners.add(listener);
  if (secondInterval === null) {
    emitSecond();
    secondInterval = window.setInterval(emitSecond, 1_000);
  }
  return () => {
    secondListeners.delete(listener);
    if (secondListeners.size === 0 && secondInterval !== null) {
      window.clearInterval(secondInterval);
      secondInterval = null;
    }
  };
}

function getSecondSnapshot() {
  return secondSnapshot;
}

function formatClock(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${remainder.toString().padStart(2, '0')}`;
}

function formatWait(minutes: number) {
  if (minutes < 1) return 'menos de 1 min';
  return `${minutes} min`;
}

interface OrderSlaIndicatorProps {
  config?: OrderOperationalSlaConfigDTO;
  statusChangedAt: string;
  fallbackElapsedMinutes?: number;
  variant?: 'timer' | 'alert' | 'detail';
}

export function OrderSlaIndicator({
  config,
  statusChangedAt,
  fallbackElapsedMinutes = 0,
  variant = 'timer',
}: OrderSlaIndicatorProps) {
  if (!config?.enabled || !config.enabledAt) return null;

  const actionableAt = new Date(statusChangedAt);
  const enabledAt = new Date(config.enabledAt);
  if (
    !Number.isFinite(actionableAt.getTime()) ||
    !Number.isFinite(enabledAt.getTime()) ||
    actionableAt < enabledAt
  ) {
    return null;
  }
  return (
    <LiveOrderSlaIndicator
      actionableAt={actionableAt}
      enabledAt={enabledAt}
      fallbackElapsedMinutes={fallbackElapsedMinutes}
      variant={variant}
    />
  );
}

function LiveOrderSlaIndicator({
  actionableAt,
  enabledAt,
  fallbackElapsedMinutes,
  variant,
}: {
  actionableAt: Date;
  enabledAt: Date;
  fallbackElapsedMinutes: number;
  variant: NonNullable<OrderSlaIndicatorProps['variant']>;
}) {
  const now = useSyncExternalStore(subscribeToSecond, getSecondSnapshot, () => 0);
  const effectiveNow = now || actionableAt.getTime() + Math.max(0, fallbackElapsedMinutes) * 60_000;
  const current = new Date(effectiveNow);
  const stage = getOrderOperationalSlaStage(
    {
      status: 'PENDING',
      statusChangedAt: actionableAt,
      config: { enabled: true, enabledAt },
    },
    current,
  );
  if (stage === 'NONE') return null;

  const seconds = getOrderOperationalSlaElapsedSeconds(actionableAt, current);
  const clock = formatClock(seconds);

  if (variant === 'timer') {
    return (
      <span
        className={cn(
          'text-sm tabular-nums',
          stage === 'NORMAL' && 'text-text-secondary',
          stage === 'WARNING' && 'text-warning font-semibold',
          stage === 'CRITICAL' && 'text-error font-bold',
        )}
      >
        {clock}
      </span>
    );
  }

  if (variant === 'detail') {
    const elapsedMinutes = Math.floor(seconds / 60);
    return (
      <div
        data-order-sla-stage={stage.toLowerCase()}
        className={cn(
          'flex items-start gap-2 rounded-lg px-3 py-2 text-sm',
          stage === 'NORMAL' && 'bg-surface-secondary text-text-secondary',
          stage === 'WARNING' && 'bg-warning-light text-warning',
          stage === 'CRITICAL' && 'bg-error-light text-error',
        )}
      >
        <Clock3 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          <strong className="block font-semibold">
            Aguardando aceite há {formatWait(elapsedMinutes)}
          </strong>
          {stage === 'CRITICAL' ? (
            <span className="mt-0.5 block">Este pedido está demorando para ser atendido.</span>
          ) : null}
        </span>
      </div>
    );
  }

  if (stage !== 'WARNING' && stage !== 'CRITICAL') return null;
  const Icon = stage === 'CRITICAL' ? CircleAlert : TriangleAlert;
  return (
    <div
      data-order-sla-stage={stage.toLowerCase()}
      className={cn(
        'order-card-alert mt-3 flex items-start gap-2 rounded-lg px-2.5 py-2 text-sm font-semibold',
        stage === 'CRITICAL' ? 'bg-error-light text-error' : 'bg-warning-light text-warning',
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="line-clamp-2 sm:line-clamp-none">
        {stage === 'CRITICAL'
          ? `Atenção: ${clock} sem aceite`
          : `Precisa de atenção · ${clock} sem aceite`}
      </span>
    </div>
  );
}

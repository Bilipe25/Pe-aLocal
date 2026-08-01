'use client';

import {
  ChefHat,
  CircleCheckBig,
  ClockAlert,
  PackagePlus,
  Truck,
  type LucideIcon,
} from 'lucide-react';
import type { OrderStatus } from '@prisma/client';

import type { OrderBoardSummaryDTO } from '@/types/order-query';
import { cn } from '@/lib/utils';

interface MetricDefinition {
  key: keyof OrderBoardSummaryDTO;
  label: string;
  helper: string;
  icon: LucideIcon;
  tone: string;
  statuses?: OrderStatus[];
  delayedOnly?: boolean;
}

const METRICS: MetricDefinition[] = [
  {
    key: 'newCount',
    label: 'Novos pedidos',
    helper: 'Aguardando aceite',
    icon: PackagePlus,
    tone: 'bg-brand-50 text-brand-700',
    statuses: ['PENDING'],
  },
  {
    key: 'preparingCount',
    label: 'Em preparo',
    helper: 'Na cozinha',
    icon: ChefHat,
    tone: 'bg-warning-light text-warning',
    statuses: ['CONFIRMED', 'PREPARING'],
  },
  {
    key: 'readyCount',
    label: 'Prontos',
    helper: 'Aguardando saída',
    icon: CircleCheckBig,
    tone: 'bg-success-light text-success',
    statuses: ['READY'],
  },
  {
    key: 'deliveryCount',
    label: 'Em entrega',
    helper: 'A caminho',
    icon: Truck,
    tone: 'bg-info-light text-info',
    statuses: ['OUT_FOR_DELIVERY'],
  },
  {
    key: 'delayedCount',
    label: 'Atrasados',
    helper: 'Atenção necessária',
    icon: ClockAlert,
    tone: 'bg-error-light text-error',
    delayedOnly: true,
  },
];

export function OrderBoardMetrics({
  summary,
  activeStatuses,
  delayedOnly,
  onSelect,
}: {
  summary: OrderBoardSummaryDTO;
  activeStatuses?: OrderStatus[];
  delayedOnly?: boolean;
  onSelect: (selection: { statuses?: OrderStatus[]; delayedOnly?: boolean }) => void;
}) {
  return (
    <section aria-label="Resumo operacional" className="orders-metrics-grid">
      {METRICS.map((metric) => {
        const Icon = metric.icon;
        const selectedStatuses = activeStatuses ?? [];
        const selected = metric.delayedOnly
          ? Boolean(delayedOnly)
          : !delayedOnly &&
            selectedStatuses.length === metric.statuses?.length &&
            metric.statuses?.every((status) => selectedStatuses.includes(status));

        return (
          <button
            key={metric.key}
            type="button"
            className={cn(
              'orders-metric-card group text-left',
              selected && 'border-brand-500 ring-brand-500/15 ring-2',
            )}
            aria-pressed={selected}
            onClick={() =>
              onSelect(
                selected
                  ? { statuses: undefined, delayedOnly: false }
                  : {
                      statuses: metric.statuses,
                      delayedOnly: metric.delayedOnly ? true : false,
                    },
              )
            }
          >
            <span className={cn('orders-metric-icon', metric.tone)}>
              <Icon aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="text-text-primary block text-sm font-semibold">{metric.label}</span>
              <strong className="text-text-primary mt-0.5 block font-mono text-xl leading-none">
                {summary[metric.key]}
              </strong>
              <span className="text-text-secondary mt-1 block truncate text-sm">
                {metric.helper}
              </span>
            </span>
          </button>
        );
      })}
    </section>
  );
}

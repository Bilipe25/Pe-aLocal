'use client';

import {
  ChefHat,
  CircleCheckBig,
  ClockAlert,
  PackagePlus,
  Truck,
  type LucideIcon,
} from 'lucide-react';

import type { OrderBoardLaneKey, OrderBoardSummaryDTO } from '@/types/order-query';
import { cn } from '@/lib/utils';

interface MetricDefinition {
  key: keyof OrderBoardSummaryDTO;
  label: string;
  singularLabel: string;
  pluralLabel: string;
  icon: LucideIcon;
  tone: string;
}

const METRICS: MetricDefinition[] = [
  {
    key: 'newCount',
    label: 'Novos',
    singularLabel: 'novo',
    pluralLabel: 'novos',
    icon: PackagePlus,
    tone: 'bg-brand-50 text-brand-700',
  },
  {
    key: 'preparingCount',
    label: 'Em preparo',
    singularLabel: 'em preparo',
    pluralLabel: 'em preparo',
    icon: ChefHat,
    tone: 'bg-warning-light text-warning',
  },
  {
    key: 'readyCount',
    label: 'Prontos',
    singularLabel: 'pronto',
    pluralLabel: 'prontos',
    icon: CircleCheckBig,
    tone: 'bg-success-light text-success',
  },
  {
    key: 'deliveryCount',
    label: 'Em entrega',
    singularLabel: 'em entrega',
    pluralLabel: 'em entrega',
    icon: Truck,
    tone: 'bg-info-light text-info',
  },
  {
    key: 'delayedCount',
    label: 'Precisam de atenção',
    singularLabel: 'com atenção',
    pluralLabel: 'com atenção',
    icon: ClockAlert,
    tone: 'bg-error-light text-error',
  },
];

export type ActiveOrderBoardLaneKey = Exclude<OrderBoardLaneKey, 'FINISHED'>;

const MOBILE_STAGES: Array<{
  key: ActiveOrderBoardLaneKey;
  label: string;
  count: (summary: OrderBoardSummaryDTO) => number;
}> = [
  { key: 'NEW', label: 'Novos', count: (summary) => summary.newCount },
  { key: 'PREPARATION', label: 'Preparo', count: (summary) => summary.preparingCount },
  {
    key: 'READY_AND_DELIVERY',
    label: 'Saída',
    count: (summary) => summary.readyCount + summary.deliveryCount,
  },
];

function orderCountLabel(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? `pedido ${singular}` : `pedidos ${plural}`}`;
}

export function OrderBoardMetrics({ summary }: { summary: OrderBoardSummaryDTO }) {
  return (
    <section aria-label="Resumo operacional" className="orders-metrics-grid">
      {METRICS.map((metric) => {
        const Icon = metric.icon;
        const count = summary[metric.key];

        return (
          <div
            key={metric.key}
            className="orders-metric-card"
            aria-label={orderCountLabel(count, metric.singularLabel, metric.pluralLabel)}
          >
            <span className={cn('orders-metric-icon', metric.tone)}>
              <Icon aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="text-text-secondary block truncate text-xs font-medium">
                {metric.label}
              </span>
              <strong className="text-text-primary block font-mono text-lg leading-tight">
                {count}
              </strong>
            </span>
          </div>
        );
      })}
    </section>
  );
}

export function OrderMobileStageSelector({
  summary,
  value,
  onChange,
}: {
  summary: OrderBoardSummaryDTO;
  value: ActiveOrderBoardLaneKey;
  onChange: (lane: ActiveOrderBoardLaneKey) => void;
}) {
  return (
    <nav className="orders-mobile-stage-selector" aria-label="Etapa visível do quadro">
      {MOBILE_STAGES.map((stage) => {
        const selected = value === stage.key;
        const count = stage.count(summary);
        return (
          <button
            key={stage.key}
            type="button"
            className="orders-mobile-stage-button"
            aria-pressed={selected}
            aria-controls={`orders-lane-section-${stage.key}`}
            onClick={() => onChange(stage.key)}
          >
            <span>{stage.label}</span>
            <span
              className="orders-mobile-stage-count"
              aria-label={`${count} ${count === 1 ? 'pedido' : 'pedidos'}`}
            >
              {count}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

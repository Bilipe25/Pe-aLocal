'use client';

import { formatCurrency } from '@/lib/utils';
import type { DailyOrderMetricsDTO } from '@/types/order-query';

interface DailyMetricsProps {
  metrics: DailyOrderMetricsDTO | undefined;
  isLoading?: boolean;
  hasError?: boolean;
}

export function DailyMetrics({ metrics, isLoading = false, hasError = false }: DailyMetricsProps) {
  if (hasError && !metrics) {
    return (
      <div className="rounded-xl border border-warning/30 bg-warning-light px-4 py-3 text-sm text-warning" role="status">
        O resumo de hoje está indisponível. A fila abaixo continua acessível.
      </div>
    );
  }

  const operationalValues = [
    ['Pedidos do dia', metrics?.orderCount ?? 0, false],
    ['Em andamento', metrics?.activeCount ?? 0, false],
  ] as const;
  const financialValues = metrics?.financialMetricsVisible
    ? ([
        ['Vendas dos pedidos do dia', metrics.grossSales ?? 0, true],
        ['Receita confirmada', metrics.paidRevenue ?? 0, true],
        ['A receber', metrics.pendingRevenue ?? 0, true],
      ] as const)
    : [];
  const values = [...operationalValues, ...financialValues];

  return (
    <div className="space-y-2">
      {hasError && metrics && (
        <p className="rounded-lg bg-warning-light px-3 py-2 text-xs text-warning" role="status">
          A atualização do resumo falhou. Exibindo os últimos valores confirmados.
        </p>
      )}
      <dl className={`grid gap-px overflow-hidden rounded-xl border border-border bg-border ${values.length > 2 ? 'sm:grid-cols-2 lg:grid-cols-5' : 'sm:grid-cols-2'}`} aria-label="Resumo dos pedidos do dia da loja">
      {values.map(([label, value, currency]) => (
        <div
          key={label}
          className="min-w-0 bg-surface p-4"
        >
          <dt className="text-sm font-medium text-text-secondary">{label}</dt>
          <dd className="mt-1 break-words font-mono text-lg font-bold text-text-primary">
            {isLoading && !metrics ? '—' : currency ? formatCurrency(value) : value}
          </dd>
        </div>
      ))}
      </dl>
    </div>
  );
}

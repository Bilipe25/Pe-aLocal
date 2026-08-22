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
      <div
        className="border-warning/30 bg-warning-light text-warning rounded-xl border px-4 py-3 text-sm"
        role="status"
      >
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
        <p className="bg-warning-light text-warning rounded-lg px-3 py-2 text-xs" role="status">
          A atualização do resumo falhou. Exibindo os últimos valores confirmados.
        </p>
      )}
      <dl
        className={`border-border bg-border grid gap-px overflow-hidden rounded-xl border ${values.length > 2 ? 'sm:grid-cols-2 lg:grid-cols-5' : 'sm:grid-cols-2'}`}
        aria-label="Resumo dos pedidos do dia da loja"
      >
        {values.map(([label, value, currency]) => (
          <div key={label} className="bg-surface min-w-0 p-4">
            <dt className="text-text-secondary text-sm font-medium">{label}</dt>
            <dd className="text-text-primary mt-1 font-mono text-lg font-bold break-words">
              {isLoading && !metrics ? '—' : currency ? formatCurrency(value) : value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

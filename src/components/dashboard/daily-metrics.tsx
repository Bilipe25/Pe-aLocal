'use client';

import { formatCurrency } from '@/lib/utils';
import { TrendingUp, ShoppingBag, Clock } from 'lucide-react';
import type { OrderWithDetails } from '@/types/order';
import { useMemo } from 'react';

export function DailyMetrics({ orders, isLoading = false, hasError = false }: { orders: OrderWithDetails[]; isLoading?: boolean; hasError?: boolean }) {
  const metrics = useMemo(() => {
    const today = new Date().setHours(0, 0, 0, 0);
    let todayOrders = 0;
    let pendingOrders = 0;
    let revenue = 0;

    for (const order of orders) {
      const isToday = new Date(order.createdAt).setHours(0, 0, 0, 0) === today;
      if (isToday) todayOrders += 1;
      if (order.status !== 'DELIVERED' && order.status !== 'CANCELLED') pendingOrders += 1;
      if (isToday && order.status !== 'CANCELLED') revenue += order.total;
    }

    return { todayOrders, pendingOrders, revenue };
  }, [orders]);

  if (hasError) {
    return (
      <div className="rounded-xl border border-warning/30 bg-warning-light px-4 py-3 text-sm text-warning" role="status">
        O resumo de hoje está indisponível. A fila abaixo continua atualizada.
      </div>
    );
  }

  return (
    <div className="grid overflow-hidden rounded-xl border border-border bg-surface sm:grid-cols-3 sm:divide-x sm:divide-border" aria-label="Resumo dos pedidos de hoje">
      <div className="flex items-center gap-3 border-b border-border p-4 sm:border-b-0">
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-info-light text-info">
          <ShoppingBag className="h-6 w-6" />
        </div>
        <div>
          <p className="text-sm font-medium text-text-secondary">Pedidos hoje</p>
          <p className="font-mono text-xl font-bold text-text-primary">{isLoading ? '—' : metrics.todayOrders}</p>
        </div>
      </div>

      <div className="flex items-center gap-3 border-b border-border p-4 sm:border-b-0">
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
          <TrendingUp className="h-6 w-6" />
        </div>
        <div>
          <p className="text-sm font-medium text-text-secondary">Faturamento hoje</p>
          <p className="font-mono text-xl font-bold text-text-primary">{isLoading ? '—' : formatCurrency(metrics.revenue)}</p>
        </div>
      </div>

      <div className="flex items-center gap-3 p-4">
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-warning-light text-warning">
          <Clock className="h-6 w-6" />
        </div>
        <div>
          <p className="text-sm font-medium text-text-secondary">Em andamento</p>
          <p className="font-mono text-xl font-bold text-text-primary">{isLoading ? '—' : metrics.pendingOrders}</p>
        </div>
      </div>
    </div>
  );
}

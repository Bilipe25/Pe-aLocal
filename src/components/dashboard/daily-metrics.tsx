'use client';

import { formatCurrency } from '@/lib/utils';
import { TrendingUp, ShoppingBag, Clock } from 'lucide-react';
import type { OrderWithDetails } from '@/types/order';

export function DailyMetrics({ orders }: { orders: OrderWithDetails[] }) {
  const today = new Date().setHours(0, 0, 0, 0);
  
  const todayOrders = orders.filter(o => new Date(o.createdAt).setHours(0, 0, 0, 0) === today);
  const pendingOrders = orders.filter(o => o.status !== 'DELIVERED' && o.status !== 'CANCELLED');
  const revenue = todayOrders
    .filter(o => o.status !== 'CANCELLED')
    .reduce((acc, o) => acc + o.total, 0);

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <div className="rounded-xl border border-border bg-surface p-4 shadow-sm flex items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-500/10 text-blue-600">
          <ShoppingBag className="h-6 w-6" />
        </div>
        <div>
          <p className="text-sm font-medium text-text-secondary">Pedidos Hoje</p>
          <p className="text-2xl font-bold text-text-primary">{todayOrders.length}</p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface p-4 shadow-sm flex items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-500/10 text-brand-600">
          <TrendingUp className="h-6 w-6" />
        </div>
        <div>
          <p className="text-sm font-medium text-text-secondary">Faturamento Hoje</p>
          <p className="text-2xl font-bold text-text-primary">{formatCurrency(revenue)}</p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface p-4 shadow-sm flex items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-yellow-500/10 text-yellow-600">
          <Clock className="h-6 w-6" />
        </div>
        <div>
          <p className="text-sm font-medium text-text-secondary">Em Andamento</p>
          <p className="text-2xl font-bold text-text-primary">{pendingOrders.length}</p>
        </div>
      </div>
    </div>
  );
}

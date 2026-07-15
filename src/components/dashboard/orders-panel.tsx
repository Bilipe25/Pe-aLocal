'use client';

import { useState } from 'react';
import { useOrders } from '@/hooks/use-orders';
import { OrderCard } from './order-card';
import { OrderFilters } from './order-filters';
import { DailyMetrics } from './daily-metrics';
import { OrderDetailModal } from './order-detail-modal';
import type { GetOrdersParams } from '@/features/orders/admin-actions';
import { Loader2 } from 'lucide-react';

export function OrdersPanel({ storeId }: { storeId: string }) {
  const [filters, setFilters] = useState<GetOrdersParams>({});
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  const { data: orders, isLoading, error } = useOrders(storeId, filters);

  const selectedOrder = orders?.find(o => o.id === selectedOrderId) || null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-text-primary">Pedidos (Real-Time)</h1>
        <div className="flex items-center gap-2">
          {/* Indicator of real-time connection */}
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
          </span>
          <span className="text-xs text-text-secondary">Conectado</span>
        </div>
      </div>

      <DailyMetrics orders={orders || []} />

      <OrderFilters filters={filters} onChange={setFilters} />

      {isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
        </div>
      ) : error ? (
        <div className="flex h-64 flex-col items-center justify-center text-center">
          <p className="text-error">Erro ao carregar pedidos</p>
        </div>
      ) : !orders || orders.length === 0 ? (
        <div className="flex h-64 flex-col items-center justify-center text-center">
          <p className="text-text-secondary">Nenhum pedido encontrado.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {orders.map((order) => (
            <OrderCard 
              key={order.id} 
              order={order} 
              onClick={() => setSelectedOrderId(order.id)} 
            />
          ))}
        </div>
      )}

      {selectedOrder && (
        <OrderDetailModal 
          order={selectedOrder} 
          onClose={() => setSelectedOrderId(null)} 
        />
      )}
    </div>
  );
}

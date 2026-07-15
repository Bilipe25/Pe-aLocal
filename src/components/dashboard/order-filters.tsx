'use client';

import type { GetOrdersParams } from '@/features/orders/admin-actions';
import { Button } from '@/components/ui/button';
import { Calendar } from 'lucide-react';

export function OrderFilters({ 
  filters, 
  onChange 
}: { 
  filters: GetOrdersParams; 
  onChange: (f: GetOrdersParams) => void 
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface p-3 shadow-sm">
      <Button
        variant={!filters.status && !filters.dateFrom ? 'default' : 'outline'}
        onClick={() => onChange({})}
        size="sm"
        className={!filters.status && !filters.dateFrom ? 'bg-text-primary text-surface' : ''}
      >
        Em Andamento (Hoje)
      </Button>

      <Button
        variant={filters.status === 'DELIVERED' ? 'default' : 'outline'}
        onClick={() => onChange({ ...filters, status: 'DELIVERED' })}
        size="sm"
        className={filters.status === 'DELIVERED' ? 'bg-text-primary text-surface' : ''}
      >
        Concluídos
      </Button>
      
      <Button
        variant={filters.status === 'CANCELLED' ? 'default' : 'outline'}
        onClick={() => onChange({ ...filters, status: 'CANCELLED' })}
        size="sm"
        className={filters.status === 'CANCELLED' ? 'bg-text-primary text-surface' : ''}
      >
        Cancelados
      </Button>

      <div className="ml-auto flex items-center gap-2">
        <Button variant="outline" size="sm" className="text-text-secondary">
          <Calendar className="mr-2 h-4 w-4" />
          Filtrar por data
        </Button>
      </div>
    </div>
  );
}

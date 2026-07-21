'use client';

import Link from 'next/link';
import { ExternalLink, Store } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { selectStoreAction } from '@/features/stores/actions';
import { cn } from '@/lib/utils';

type StoreStatus = 'OPEN' | 'CLOSED' | 'PAUSED';

export interface StoreSwitcherItem {
  id: string;
  name: string;
  slug: string;
  status: StoreStatus;
  isActive: boolean;
}

const STATUS_LABELS = {
  OPEN: { label: 'Aberta', className: 'bg-success-light text-success' },
  CLOSED: { label: 'Fechada', className: 'bg-error-light text-error' },
  PAUSED: { label: 'Pausada', className: 'bg-warning-light text-warning' },
} as const;

export function StoreSwitcher({
  stores,
  activeStore,
}: {
  stores: StoreSwitcherItem[];
  activeStore: StoreSwitcherItem | null;
}) {
  if (stores.length === 0) return null;

  const status = activeStore ? STATUS_LABELS[activeStore.status] : null;

  return (
    <div className="bg-surface-secondary mb-5 rounded-xl p-3">
      <div className="flex items-start gap-2">
        <Store className="text-brand-600 mt-0.5" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-text-primary text-sm font-semibold">
            {activeStore?.name ?? 'Selecione uma unidade'}
          </p>
          {status && (
            <span
              className={cn(
                'mt-1 inline-flex rounded-full px-2 py-0.5 text-xs font-semibold',
                status.className,
              )}
            >
              {status.label}
            </span>
          )}
        </div>
      </div>

      {stores.length > 1 && (
        <form action={selectStoreAction} className="mt-3 space-y-2">
          <label htmlFor="dashboard-store" className="text-text-secondary text-xs font-medium">
            Unidade ativa
          </label>
          <select
            id="dashboard-store"
            name="storeId"
            defaultValue={activeStore?.id ?? ''}
            required
            className="border-border bg-surface text-text-primary focus-visible:ring-brand-500 min-h-11 w-full rounded-lg border px-3 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            <option value="" disabled>
              Escolha uma loja
            </option>
            {stores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name}
              </option>
            ))}
          </select>
          <Button type="submit" variant="outline" size="sm" className="w-full">
            Trocar unidade
          </Button>
        </form>
      )}

      {activeStore && (
        <Button asChild variant="ghost" size="sm" className="mt-2 w-full justify-start">
          <Link href={`/${activeStore.slug}`} target="_blank" rel="noreferrer">
            <ExternalLink aria-hidden="true" /> Ver cardápio
          </Link>
        </Button>
      )}
    </div>
  );
}

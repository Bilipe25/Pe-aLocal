'use client';

import { useState } from 'react';
import { ChevronDown, Store } from 'lucide-react';

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
  OPEN: { label: 'Aberta', dotClassName: 'bg-success' },
  CLOSED: { label: 'Fechada', dotClassName: 'bg-error' },
  PAUSED: { label: 'Pausada', dotClassName: 'bg-warning' },
} as const;

interface StoreSwitcherProps {
  stores: StoreSwitcherItem[];
  activeStore: StoreSwitcherItem | null;
  returnTo: string;
  className?: string;
}

export function StoreSwitcher({ stores, activeStore, returnTo, className }: StoreSwitcherProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (stores.length === 0) return null;

  const status = activeStore ? STATUS_LABELS[activeStore.status] : null;

  if (stores.length === 1 && activeStore) {
    return (
      <div
        className={cn(
          'border-border bg-surface flex min-h-11 min-w-0 items-center gap-3 rounded-lg border px-3 shadow-sm',
          className,
        )}
        aria-label={`Unidade ativa: ${activeStore.name}, ${status?.label ?? 'status indisponível'}`}
      >
        <Store className="text-brand-600 h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="text-text-primary min-w-0 flex-1 truncate text-sm font-semibold">
          {activeStore.name}
        </span>
        {status && (
          <span
            className={cn('h-2 w-2 shrink-0 rounded-full', status.dotClassName)}
            aria-hidden="true"
          />
        )}
      </div>
    );
  }

  return (
    <form
      action={selectStoreAction}
      className={cn('relative min-w-0', className)}
      aria-busy={isSubmitting}
    >
      <input type="hidden" name="returnTo" value={returnTo} />
      <Store
        className="text-brand-600 pointer-events-none absolute top-1/2 left-3 z-10 h-4 w-4 -translate-y-1/2"
        aria-hidden="true"
      />
      <select
        aria-label="Unidade ativa"
        name="storeId"
        defaultValue={activeStore?.id ?? ''}
        required
        disabled={isSubmitting}
        onChange={(event) => {
          setIsSubmitting(true);
          event.currentTarget.form?.requestSubmit();
        }}
        className="border-border bg-surface text-text-primary focus-visible:ring-brand-500 min-h-11 w-full appearance-none truncate rounded-lg border py-2 pr-9 pl-10 text-sm font-semibold shadow-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-wait disabled:opacity-70"
      >
        <option value="" disabled>
          Selecione uma unidade
        </option>
        {stores.map((store) => (
          <option key={store.id} value={store.id}>
            {store.name} · {STATUS_LABELS[store.status].label}
          </option>
        ))}
      </select>
      <ChevronDown
        className="text-text-muted pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2"
        aria-hidden="true"
      />
    </form>
  );
}

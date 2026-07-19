import type { TenantStatus } from '@prisma/client';

import { cn } from '@/lib/utils';

const STATUS: Record<TenantStatus, { label: string; className: string }> = {
  ACTIVE: { label: 'Ativo', className: 'bg-success-light text-success' },
  SUSPENDED: { label: 'Suspenso', className: 'bg-error-light text-error' },
  PENDING: { label: 'Pendente', className: 'bg-warning-light text-warning' },
};

export function TenantStatusBadge({
  status,
  className,
}: {
  status: TenantStatus;
  className?: string;
}) {
  const config = STATUS[status];
  return (
    <span
      className={cn(
        'inline-flex shrink-0 rounded-full px-2.5 py-1 text-xs font-medium',
        config.className,
        className,
      )}
    >
      {config.label}
    </span>
  );
}

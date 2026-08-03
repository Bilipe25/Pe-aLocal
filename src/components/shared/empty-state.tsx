import { Package } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
  actionLabel?: string;
  actionHref?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  actionLabel,
  actionHref,
}: EmptyStateProps) {
  return (
    <div className="border-border bg-surface flex flex-col items-center justify-center rounded-xl border border-dashed py-12 text-center">
      <div className="bg-surface-secondary text-text-muted mb-4 rounded-full p-3">
        {icon ?? <Package className="h-6 w-6" />}
      </div>
      <h3 className="text-text-primary text-lg font-semibold">{title}</h3>
      <p className="text-text-secondary mt-1 max-w-sm text-sm">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
      {actionLabel && actionHref && (
        <Button asChild size="sm" className="mt-4">
          <Link href={actionHref}>{actionLabel}</Link>
        </Button>
      )}
    </div>
  );
}

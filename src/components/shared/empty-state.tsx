import { Package } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
}

export function EmptyState({ icon, title, description, actionLabel, actionHref }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface py-12 text-center">
      <div className="mb-4 rounded-full bg-surface-secondary p-3 text-text-muted">
        {icon ?? <Package className="h-6 w-6" />}
      </div>
      <h3 className="text-lg font-semibold text-text-primary">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-text-secondary">{description}</p>
      {actionLabel && actionHref && (
        <Button asChild size="sm" className="mt-4">
          <Link href={actionHref}>{actionLabel}</Link>
        </Button>
      )}
    </div>
  );
}

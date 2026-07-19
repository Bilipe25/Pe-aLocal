import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

interface PageHeaderProps {
  title: string;
  description?: string;
  backHref?: string;
  actions?: React.ReactNode;
}

export function PageHeader({ title, description, backHref, actions }: PageHeaderProps) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 items-start gap-2 sm:gap-3">
        {backHref && (
          <Link
            href={backHref}
            aria-label={`Voltar: ${title}`}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-surface-secondary hover:text-text-primary"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
        )}
        <div className="min-w-0">
          <h1 className="text-balance text-2xl font-bold text-text-primary">{title}</h1>
          {description && (
            <p className="mt-1 text-sm text-text-secondary">{description}</p>
          )}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 sm:shrink-0">{actions}</div>}
    </div>
  );
}

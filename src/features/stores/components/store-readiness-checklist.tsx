import Link from 'next/link';
import { AlertTriangle, ArrowRight, CheckCircle2, CircleAlert } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import type {
  StoreReadiness,
  StoreReadinessIssue,
} from '@/server/services/store-readiness.service';

function IssueList({
  title,
  issues,
  type,
  showActions,
}: {
  title: string;
  issues: StoreReadinessIssue[];
  type: 'blocker' | 'warning';
  showActions: boolean;
}) {
  if (issues.length === 0) return null;
  const Icon = type === 'blocker' ? CircleAlert : AlertTriangle;

  return (
    <div className="space-y-2">
      <h3 className="text-text-primary text-sm font-semibold">{title}</h3>
      <ul className="divide-border divide-y">
        {issues.map((item) => (
          <li key={item.code} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
            <Icon
              className={
                type === 'blocker' ? 'text-error mt-0.5 h-4 w-4' : 'text-warning mt-0.5 h-4 w-4'
              }
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <p className="text-text-primary text-sm font-medium">{item.title}</p>
              <p className="text-text-secondary mt-0.5 text-sm">{item.description}</p>
            </div>
            {showActions && item.actionHref && (
              <Link
                href={item.actionHref}
                className="text-brand-700 hover:text-brand-800 inline-flex min-h-11 shrink-0 items-center gap-1 px-1 text-sm font-semibold"
              >
                Corrigir <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function StoreReadinessChecklist({
  readiness,
  showActions = true,
}: {
  readiness: StoreReadiness;
  showActions?: boolean;
}) {
  const blockerCount = readiness.blockers.length;

  return (
    <section
      className="border-border bg-surface-secondary mb-6 rounded-xl border p-4 sm:p-5"
      aria-labelledby="store-readiness-title"
    >
      <div className="flex items-start gap-3">
        <span
          className={
            readiness.isReady
              ? 'bg-success-light text-success rounded-lg p-2'
              : 'bg-error-light text-error rounded-lg p-2'
          }
        >
          {readiness.isReady ? (
            <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
          ) : (
            <CircleAlert className="h-5 w-5" aria-hidden="true" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="store-readiness-title" className="text-text-primary font-semibold">
              {readiness.isReady
                ? 'Pronta para receber pedidos'
                : `${blockerCount} ${blockerCount === 1 ? 'pendência' : 'pendências'} antes de abrir`}
            </h2>
            <Badge variant={readiness.isReady ? 'success' : 'destructive'}>
              {readiness.isReady ? 'Pronta' : 'Ação necessária'}
            </Badge>
          </div>
          <p className="text-text-secondary mt-1 text-sm">
            {readiness.isReady
              ? 'As regras essenciais de operação estão atendidas.'
              : 'Resolva os bloqueadores abaixo. Avisos não impedem a abertura.'}
          </p>
        </div>
      </div>

      {readiness.issues.length > 0 && (
        <div className="border-border mt-4 space-y-4 border-t pt-4">
          <IssueList
            title="Bloqueadores"
            issues={readiness.blockers}
            type="blocker"
            showActions={showActions}
          />
          <IssueList
            title="Recomendações"
            issues={readiness.warnings}
            type="warning"
            showActions={showActions}
          />
        </div>
      )}
    </section>
  );
}

import { cn } from '@/lib/utils';

export function ChangeScopeBadge({ scope }: { scope: 'draft' | 'immediate' }) {
  const draft = scope === 'draft';
  return (
    <span
      className={cn(
        'inline-flex min-h-6 items-center rounded-full px-2.5 text-xs font-medium',
        draft ? 'bg-info-light text-info' : 'bg-warning-light text-warning',
      )}
    >
      {draft ? 'Publica com o rascunho' : 'Aplica imediatamente'}
    </span>
  );
}

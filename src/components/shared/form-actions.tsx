'use client';

import { RotateCcw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { FormSubmitButton } from '@/components/shared/form-submit-button';
import { cn } from '@/lib/utils';

export function FormActions({
  isDirty,
  onRestore,
  submitLabel,
  pending = false,
  compactMobile = false,
  submitDisabled = false,
}: {
  isDirty: boolean;
  onRestore: () => void;
  submitLabel: string;
  pending?: boolean;
  compactMobile?: boolean;
  submitDisabled?: boolean;
}) {
  return (
    <div
      className={cn(
        'border-border bg-surface sticky bottom-0 z-20 -mx-4 flex items-center justify-between gap-3 border-t px-4 py-3 sm:static sm:mx-0 sm:border-0 sm:px-0 sm:pt-2 sm:pb-0',
        compactMobile &&
          'min-h-16 py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] sm:min-h-0 sm:py-0 sm:pt-2',
      )}
    >
      <div className={cn('min-w-0', compactMobile && 'flex items-center gap-1 sm:block')}>
        <p
          className={cn(
            'text-text-secondary text-xs',
            compactMobile && 'hidden min-[380px]:block sm:block',
          )}
          aria-live="polite"
        >
          {isDirty ? 'Alterações ainda não salvas' : 'Nenhuma alteração pendente'}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onRestore}
          disabled={!isDirty}
          className={cn('mt-0.5 px-0', compactMobile && 'mt-0 h-11 px-2 sm:mt-0.5 sm:h-9 sm:px-0')}
          aria-label="Restaurar valores salvos"
        >
          <RotateCcw aria-hidden="true" />
          <span className={cn(compactMobile && 'hidden sm:inline')}>Restaurar valores</span>
        </Button>
      </div>
      <FormSubmitButton disabled={!isDirty || pending || submitDisabled} aria-busy={pending}>
        {pending ? 'Salvando…' : submitLabel}
      </FormSubmitButton>
    </div>
  );
}

'use client';

import { RotateCcw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { FormSubmitButton } from '@/components/shared/form-submit-button';

export function FormActions({
  isDirty,
  onRestore,
  submitLabel,
  pending = false,
}: {
  isDirty: boolean;
  onRestore: () => void;
  submitLabel: string;
  pending?: boolean;
}) {
  return (
    <div className="border-border bg-surface sticky bottom-0 z-20 -mx-4 flex items-center justify-between gap-3 border-t px-4 py-3 sm:static sm:mx-0 sm:border-0 sm:px-0 sm:pt-2 sm:pb-0">
      <div className="min-w-0">
        <p className="text-text-secondary text-xs" aria-live="polite">
          {isDirty ? 'Alterações ainda não salvas' : 'Nenhuma alteração pendente'}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onRestore}
          disabled={!isDirty}
          className="mt-0.5 px-0"
        >
          <RotateCcw aria-hidden="true" /> Restaurar valores
        </Button>
      </div>
      <FormSubmitButton disabled={!isDirty || pending} aria-busy={pending}>
        {pending ? 'Salvando…' : submitLabel}
      </FormSubmitButton>
    </div>
  );
}

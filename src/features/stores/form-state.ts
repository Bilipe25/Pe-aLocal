import type { ActionResult } from '@/server/errors';

export interface FormActionState {
  success: boolean;
  message?: string;
  fieldErrors?: Record<string, string[]>;
  formError?: string;
  configurationVersion?: number;
}

export type StoreFormActionResult = ActionResult<{ configurationVersion: number }> &
  FormActionState;

export function fieldErrorsFromDetails(details?: Record<string, unknown>[]) {
  const fieldErrors: Record<string, string[]> = {};
  for (const detail of details ?? []) {
    const field = typeof detail.field === 'string' ? detail.field : '';
    const message = typeof detail.message === 'string' ? detail.message : '';
    if (!field || !message) continue;
    fieldErrors[field] = [...(fieldErrors[field] ?? []), message];
  }
  return fieldErrors;
}

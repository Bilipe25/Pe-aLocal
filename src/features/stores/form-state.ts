import type { ActionResult } from '@/server/errors';

export { fieldErrorsFromDetails } from '@/lib/form-errors';

export interface FormActionState {
  success: boolean;
  message?: string;
  fieldErrors?: Record<string, string[]>;
  formError?: string;
  configurationVersion?: number;
}

export type StoreFormActionResult = ActionResult<{ configurationVersion: number }> &
  FormActionState;

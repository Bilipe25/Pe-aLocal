import type { ZodError } from 'zod';

import { ValidationError } from '@/server/errors';

export function catalogValidationError(error: ZodError): ValidationError {
  const details = error.issues.map((issue) => ({
    field: issue.path.join('.'),
    message: issue.message,
  }));
  const message = error.issues[0]?.message ?? 'Revise os dados informados.';

  return new ValidationError(message, details);
}

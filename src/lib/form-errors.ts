/** Converts safe validation details returned by server actions into field messages. */
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

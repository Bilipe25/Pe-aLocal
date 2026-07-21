import type { ReactNode } from 'react';

interface FormMessageProps {
  message: string | null;
  fieldErrors?: Record<string, string[]>;
  /** Nó React opcional exibido ao lado da mensagem (ex.: botão de recarregar). */
  action?: ReactNode;
}

export function FormMessage({ message, fieldErrors = {}, action }: FormMessageProps) {
  const entries = Object.entries(fieldErrors);
  if (!message && entries.length === 0) return null;

  return (
    <div role="alert" className="bg-error-light text-error rounded-lg px-3 py-2 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <p className="font-semibold">{message ?? 'Revise os campos destacados.'}</p>
          {entries.length > 0 && (
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {entries.flatMap(([field, errors]) =>
                errors.map((error) => <li key={`${field}-${error}`}>{error}</li>),
              )}
            </ul>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </div>
  );
}


export function FieldMessage({ id, errors }: { id: string; errors?: string[] }) {
  if (!errors?.length) return null;
  return (
    <p id={id} className="text-error text-sm font-medium">
      {errors.join(' ')}
    </p>
  );
}

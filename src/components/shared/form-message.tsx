interface FormMessageProps {
  message: string | null;
  fieldErrors?: Record<string, string[]>;
}

export function FormMessage({ message, fieldErrors = {} }: FormMessageProps) {
  const entries = Object.entries(fieldErrors);
  if (!message && entries.length === 0) return null;

  return (
    <div role="alert" className="bg-error-light text-error rounded-lg px-3 py-2 text-sm">
      <p className="font-semibold">{message ?? 'Revise os campos destacados.'}</p>
      {entries.length > 0 && (
        <ul className="mt-1 list-disc space-y-0.5 pl-5">
          {entries.flatMap(([field, errors]) =>
            errors.map((error) => <li key={`${field}-${error}`}>{error}</li>),
          )}
        </ul>
      )}
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

interface FormMessageProps {
  message: string | null;
}

export function FormMessage({ message }: FormMessageProps) {
  if (!message) return null;

  return (
    <p role="alert" className="rounded-lg bg-error-light px-3 py-2 text-sm font-medium text-error">
      {message}
    </p>
  );
}

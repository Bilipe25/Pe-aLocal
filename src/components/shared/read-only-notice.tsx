import { Eye } from 'lucide-react';

export function ReadOnlyNotice({
  message = 'Seu perfil pode consultar estas informações, mas não pode alterá-las.',
}: {
  message?: string;
}) {
  return (
    <div
      className="bg-info-light text-text-primary mb-4 flex items-start gap-3 rounded-lg p-3 text-sm"
      role="status"
    >
      <Eye className="text-info mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <p>{message}</p>
    </div>
  );
}

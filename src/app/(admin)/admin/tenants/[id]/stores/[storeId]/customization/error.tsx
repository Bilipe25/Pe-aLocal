'use client';

import { AlertTriangle } from 'lucide-react';

import { Button } from '@/components/ui/button';

export default function CustomizationError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section className="border-error/30 bg-error-light rounded-xl border p-6">
      <AlertTriangle className="text-error h-6 w-6" aria-hidden="true" />
      <h1 className="text-text-primary mt-3 text-xl font-semibold">
        O editor não pôde ser carregado
      </h1>
      <p className="text-text-secondary mt-2 max-w-2xl text-sm">
        Nenhuma personalização foi publicada. Recarregue os dados antes de continuar.
      </p>
      <Button type="button" onClick={reset} className="mt-5">
        Recarregar editor
      </Button>
    </section>
  );
}

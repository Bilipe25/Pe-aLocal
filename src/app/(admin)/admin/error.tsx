'use client';

import { AlertTriangle } from 'lucide-react';

import { Button } from '@/components/ui/button';

export default function AdminError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section className="border-error/30 bg-error-light mx-auto max-w-2xl rounded-xl border p-6">
      <AlertTriangle className="text-error h-6 w-6" aria-hidden="true" />
      <h1 className="text-text-primary mt-3 text-xl font-semibold">
        Não foi possível carregar a administração
      </h1>
      <p className="text-text-secondary mt-2 text-sm">
        Os dados não foram alterados. Tente novamente; se o erro continuar, registre o horário para
        investigação.
      </p>
      <Button type="button" onClick={reset} className="mt-5">
        Tentar novamente
      </Button>
    </section>
  );
}

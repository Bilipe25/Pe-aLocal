'use client';

import { Button } from '@/components/ui/button';

export default function DiningRoomError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-16 sm:px-6" role="alert">
      <h1 className="font-display text-text-primary text-2xl font-bold">
        Não foi possível abrir o salão
      </h1>
      <p className="text-text-secondary mt-2">
        Os pedidos continuam seguros. Tente carregar a visão operacional novamente.
      </p>
      <Button type="button" className="mt-6" onClick={reset}>
        Tentar novamente
      </Button>
    </main>
  );
}

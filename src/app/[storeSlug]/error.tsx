'use client';

import { House, RefreshCw, Store } from 'lucide-react';
import Link from 'next/link';
import { useEffect } from 'react';

import { Button } from '@/components/ui/button';

interface StorefrontErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function StorefrontError({ error, reset }: StorefrontErrorProps) {
  useEffect(() => {
    console.error('[STOREFRONT_SEGMENT_ERROR]', {
      digest: error.digest ?? 'unavailable',
    });
  }, [error.digest]);

  return (
    <main className="bg-papel text-tinta flex min-h-[70vh] items-center justify-center px-4 py-12">
      <section className="w-full max-w-md text-center" role="alert" aria-live="assertive">
        <Store className="text-pimenta mx-auto h-11 w-11" aria-hidden="true" />
        <h1 className="font-display mt-4 text-2xl font-bold text-balance">
          Não foi possível carregar esta loja
        </h1>
        <p className="text-text-muted mt-3 text-sm leading-6 text-pretty">
          A conexão pode ter sido interrompida. Tente novamente sem perder sua sacola.
        </p>
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          <Button type="button" onClick={reset} className="storefront-primary-action min-h-11">
            <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
            Tentar novamente
          </Button>
          <Button asChild variant="outline" className="min-h-11">
            <Link href="/">
              <House className="mr-2 h-4 w-4" aria-hidden="true" />
              Ir para o início
            </Link>
          </Button>
        </div>
      </section>
    </main>
  );
}

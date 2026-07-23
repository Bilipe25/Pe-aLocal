import Link from 'next/link';
import { House, Store } from 'lucide-react';

export function PublicNotFoundState() {
  return (
    <main className="bg-papel text-tinta flex min-h-screen items-center justify-center px-4 py-12">
      <section className="w-full max-w-md text-center">
        <Store className="text-text-muted mx-auto h-11 w-11" aria-hidden="true" />
        <h1 className="font-display mt-4 text-2xl font-bold text-balance">
          Não encontramos esta página
        </h1>
        <p className="text-text-muted mt-3 text-sm leading-6 text-pretty">
          O endereço pode estar incorreto ou não estar mais disponível.
        </p>
        <Link
          href="/"
          className="bg-pimenta hover:bg-brand-600 focus-visible:ring-pimenta mt-6 inline-flex min-h-11 items-center justify-center rounded-xl px-4 py-2 text-sm font-medium text-white transition-colors focus-visible:ring-2 focus-visible:ring-offset-2"
        >
          <House className="mr-2 h-4 w-4" aria-hidden="true" />
          Voltar ao início
        </Link>
      </section>
    </main>
  );
}

import Link from 'next/link';
import { Store } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <Store className="mb-4 h-12 w-12 text-text-muted" />
      <h1 className="text-4xl font-bold text-text-primary">404</h1>
      <p className="mt-2 text-lg text-text-secondary">Página não encontrada</p>
      <p className="mt-1 text-sm text-text-muted">
        A página que você procura não existe ou foi removida.
      </p>
      <Link
        href="/"
        className="mt-6 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-600"
      >
        Voltar ao início
      </Link>
    </div>
  );
}

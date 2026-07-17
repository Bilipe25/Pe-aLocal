import Link from 'next/link';
import { LockKeyhole } from 'lucide-react';

export const metadata = { title: 'Acesso negado' };

export default function AccessDeniedPage() {
  return (
    <main className="bg-surface-secondary flex min-h-screen items-center justify-center p-4">
      <section className="border-border bg-surface w-full max-w-md rounded-xl border p-8 text-center shadow-sm">
        <LockKeyhole className="text-error mx-auto h-10 w-10" />
        <h1 className="text-text-primary mt-4 text-2xl font-bold">Acesso negado</h1>
        <p className="text-text-secondary mt-3 text-sm leading-6">
          Esta área é exclusiva para administradores da plataforma. Papéis de estabelecimento não
          concedem acesso à administração geral.
        </p>
        <Link
          href="/dashboard"
          className="bg-brand-500 hover:bg-brand-600 mt-6 inline-flex rounded-md px-4 py-2 text-sm font-medium text-white"
        >
          Voltar ao painel
        </Link>
      </section>
    </main>
  );
}

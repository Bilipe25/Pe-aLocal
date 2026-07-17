import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ShieldAlert, Store } from 'lucide-react';

import { requireAuthenticatedUser } from '@/server/auth';
import { PlatformRole } from '@/server/permissions';

export const metadata = {
  title: 'Acesso indisponível',
};

export default async function AccessPendingPage() {
  let session;
  try {
    session = await requireAuthenticatedUser();
  } catch {
    redirect('/login');
  }

  if (session.platformRole === PlatformRole.SUPER_ADMIN) {
    redirect('/admin');
  }
  if (session.tenantId && session.tenantRole) {
    redirect('/dashboard');
  }

  return (
    <main className="from-brand-50 via-surface to-brand-100 flex min-h-screen items-center justify-center bg-gradient-to-br p-4">
      <section className="border-border bg-surface w-full max-w-lg rounded-xl border p-8 text-center shadow-md">
        <div className="text-brand-500 mb-5 flex items-center justify-center gap-2">
          <Store className="h-7 w-7" />
          <span className="text-xl font-bold">PedidoLocal</span>
        </div>
        <ShieldAlert className="text-warning mx-auto h-10 w-10" />
        <h1 className="text-text-primary mt-4 text-2xl font-bold">Acesso ainda não disponível</h1>
        <p className="text-text-secondary mt-3 text-sm leading-6">
          Sua conta está autenticada, mas não possui acesso ativo a um estabelecimento. Peça ao
          responsável pelo estabelecimento para adicionar ou reativar sua participação.
        </p>
        <p className="text-text-muted mt-2 text-xs">Conta: {session.email}</p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <Link
            href="/"
            className="border-border text-text-secondary hover:bg-surface-secondary rounded-md border px-4 py-2 text-sm"
          >
            Página inicial
          </Link>
          <form action="/api/auth/logout" method="POST">
            <button
              type="submit"
              className="bg-brand-500 hover:bg-brand-600 rounded-md px-4 py-2 text-sm font-medium text-white"
            >
              Sair
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}

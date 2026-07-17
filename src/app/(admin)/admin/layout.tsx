import { LogOut, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';

import { requireSuperAdmin } from '@/server/auth';
import { AuthenticationError } from '@/server/errors';

export const metadata = {
  title: { default: 'Administração geral', template: '%s | PedidoLocal Admin' },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await connection();

  let session;
  try {
    session = await requireSuperAdmin();
  } catch (error) {
    if (error instanceof AuthenticationError) redirect('/login?redirect=/admin');
    redirect('/access-denied');
  }

  return (
    <div className="bg-surface-secondary min-h-screen">
      <header className="border-border bg-surface border-b px-4 py-3">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <Link href="/admin" className="text-text-primary flex items-center gap-2 font-bold">
            <ShieldCheck className="text-brand-500 h-5 w-5" />
            PedidoLocal Admin
          </Link>
          <div className="flex items-center gap-4">
            <span className="text-text-secondary hidden text-sm sm:inline">{session.name}</span>
            <form action="/api/auth/logout" method="POST">
              <button
                type="submit"
                className="text-text-secondary hover:bg-surface-secondary hover:text-text-primary flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm"
              >
                <LogOut className="h-4 w-4" />
                Sair
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}

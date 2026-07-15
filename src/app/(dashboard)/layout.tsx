import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { requireAuthenticatedUser } from '@/server/auth';
import { LogOut } from 'lucide-react';
import { QueryProvider } from '@/providers/query-provider';

export const metadata = {
  title: 'Painel',
};

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await connection();
  let session;
  try {
    session = await requireAuthenticatedUser();
  } catch {
    redirect('/login');
  }

  return (
    <div className="min-h-screen bg-surface-secondary">
      <header className="border-b border-border bg-surface px-4 py-3">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <span className="text-lg font-bold text-text-primary">PedidoLocal</span>
          <div className="flex items-center gap-4">
            <span className="text-sm text-text-secondary">
              {session.name}
            </span>
            <form action="/api/auth/logout" method="POST">
              <button
                type="submit"
                className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-text-secondary transition-colors hover:bg-surface-secondary hover:text-text-primary"
                title="Sair"
              >
                <LogOut className="h-4 w-4" />
                Sair
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">
        <QueryProvider>
          {children}
        </QueryProvider>
      </main>
    </div>
  );
}

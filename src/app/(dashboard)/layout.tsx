import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { requireAuthenticatedUser } from '@/server/auth';
import { PlatformRole } from '@/server/permissions';
import { LogOut } from 'lucide-react';
import { QueryProvider } from '@/providers/query-provider';

export const metadata = {
  title: 'Painel',
};

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  await connection();
  let session;
  try {
    session = await requireAuthenticatedUser();
  } catch {
    redirect('/login?redirect=/dashboard');
  }

  if (session.platformRole === PlatformRole.SUPER_ADMIN) {
    redirect('/admin');
  }

  if (!session.tenantId || !session.tenantRole) {
    redirect('/access-pending');
  }

  return (
    <div className="bg-surface-secondary min-h-screen">
      <header className="border-border bg-surface border-b px-4 py-3">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <span className="text-text-primary text-lg font-bold">PedidoLocal</span>
          <div className="flex items-center gap-4">
            <span className="text-text-secondary text-sm">{session.name}</span>
            <form action="/api/auth/logout" method="POST">
              <button
                type="submit"
                className="text-text-secondary hover:bg-surface-secondary hover:text-text-primary flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors"
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
        <QueryProvider>{children}</QueryProvider>
      </main>
    </div>
  );
}

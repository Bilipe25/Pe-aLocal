import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { requireAuthenticatedUser } from '@/server/auth';
import { PlatformRole } from '@/server/permissions';
import { QueryProvider } from '@/providers/query-provider';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { getDb } from '@/server/database/client';

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

  const store = await getDb().store.findFirst({
    where: { tenantId: session.tenantId },
    select: { name: true, slug: true, status: true },
  });

  return (
    <DashboardShell userName={session.name} store={store}>
      <QueryProvider>{children}</QueryProvider>
    </DashboardShell>
  );
}

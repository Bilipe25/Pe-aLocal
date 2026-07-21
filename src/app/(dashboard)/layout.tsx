import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { requireAuthenticatedUser } from '@/server/auth';
import { PlatformRole } from '@/server/permissions';
import { QueryProvider } from '@/providers/query-provider';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import {
  getActiveStoreContext,
  listAccessibleStores,
} from '@/server/services/store-context.service';

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

  const [storesPage, activeContext] = await Promise.all([
    listAccessibleStores({ pageSize: 100 }),
    getActiveStoreContext(),
  ]);
  const activeStore = activeContext?.store
    ? {
        id: activeContext.store.id,
        name: activeContext.store.name,
        slug: activeContext.store.slug,
        status: activeContext.store.status,
        isActive: activeContext.store.isActive,
      }
    : null;

  return (
    <DashboardShell userName={session.name} stores={storesPage.items} activeStore={activeStore}>
      <QueryProvider>{children}</QueryProvider>
    </DashboardShell>
  );
}

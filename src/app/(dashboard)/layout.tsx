import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { requireAuthenticatedUser } from '@/server/auth';
import { hasTenantPermission, Permission, PlatformRole } from '@/server/permissions';
import { QueryProvider } from '@/providers/query-provider';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { DashboardOperationsProvider } from '@/components/dashboard/dashboard-operations-context';
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
    <DashboardOperationsProvider>
      <DashboardShell
        userName={session.name}
        tenantRole={session.tenantRole}
        stores={storesPage.items}
        activeStore={activeStore}
        activeStoreTimeZone={activeContext?.store.timeZone ?? null}
        initialNowIso={new Date().toISOString()}
        canViewCoupons={hasTenantPermission(session.tenantRole, Permission.VIEW_COUPONS)}
      >
        <QueryProvider>{children}</QueryProvider>
      </DashboardShell>
    </DashboardOperationsProvider>
  );
}

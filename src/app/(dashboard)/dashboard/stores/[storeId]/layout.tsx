import { requireTenantStoreAccess } from '@/server/auth';

export default async function StoreLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  await requireTenantStoreAccess(storeId);
  return children;
}

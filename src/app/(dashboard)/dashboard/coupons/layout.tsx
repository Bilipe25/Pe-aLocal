import { redirect } from 'next/navigation';

import { AuthorizationError } from '@/server/errors';
import { Permission } from '@/server/permissions';
import { getActiveStoreContext } from '@/server/services/store-context.service';

export default async function CouponsLayout({ children }: { children: React.ReactNode }) {
  let context;
  try {
    context = await getActiveStoreContext(Permission.VIEW_COUPONS);
  } catch (error) {
    if (error instanceof AuthorizationError) redirect('/dashboard');
    throw error;
  }
  if (!context) redirect('/dashboard/stores');

  return children;
}

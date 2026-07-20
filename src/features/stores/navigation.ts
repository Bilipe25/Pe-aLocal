import 'server-only';

import { redirect } from 'next/navigation';

import { getActiveStoreContext } from '@/server/services/store-context.service';

export async function redirectLegacyStoreRoute(segment = ''): Promise<never> {
  const context = await getActiveStoreContext();
  if (!context) redirect('/dashboard/stores');

  const suffix = segment ? `/${segment}` : '';
  redirect(`/dashboard/stores/${context.store.id}${suffix}`);
}

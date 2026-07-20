import 'server-only';

import { redirect } from 'next/navigation';

import { AuthorizationError, TenantAccessError } from '@/server/errors';

export async function loadStorePageData<T>(loader: () => Promise<T>): Promise<T> {
  try {
    return await loader();
  } catch (error) {
    if (error instanceof AuthorizationError || error instanceof TenantAccessError) {
      redirect('/dashboard/stores?access=denied');
    }
    throw error;
  }
}

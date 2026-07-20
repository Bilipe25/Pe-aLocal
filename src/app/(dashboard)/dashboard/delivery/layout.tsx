import { redirect } from 'next/navigation';

import { getActiveStoreContext } from '@/server/services/store-context.service';

export default async function DeliveryLayout({ children }: { children: React.ReactNode }) {
  const context = await getActiveStoreContext();
  if (!context) redirect('/dashboard/stores');

  return children;
}

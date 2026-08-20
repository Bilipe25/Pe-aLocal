import { redirect } from 'next/navigation';

import { DineInUnavailable } from '@/components/storefront/dine-in-unavailable';
import {
  getDiningSessionOrderingHref,
  getPublicDiningSession,
} from '@/server/services/dining-table-session.service';

export const dynamic = 'force-dynamic';

export default async function ContinueDiningSessionPage({
  params,
}: {
  params: Promise<{ sessionToken: string }>;
}) {
  const { sessionToken } = await params;
  const [session, orderingHref] = await Promise.all([
    getPublicDiningSession(sessionToken),
    getDiningSessionOrderingHref(sessionToken),
  ]);
  if (session.state !== 'OPEN' || !orderingHref) {
    return <DineInUnavailable state="INVALID" storeName={session.storeName} />;
  }
  redirect(orderingHref);
}

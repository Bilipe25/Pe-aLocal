import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';

import { ConsumerCommunicationPreferences } from '@/components/storefront/consumer-communication-preferences';
import { StorePurchaseHeader } from '@/components/storefront/store-purchase-header';
import { getPublicStoreShellBySlug } from '@/server/queries/public-store';
import { CONSUMER_SESSION_COOKIE } from '@/server/services/consumer-auth.service';
import { getConsumerCommunicationPreference } from '@/server/services/consumer-communication-preference.service';

export const dynamic = 'force-dynamic';

export default async function ConsumerCommunicationsPage({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params;
  const store = await getPublicStoreShellBySlug(storeSlug);
  if (!store) notFound();
  let result;
  try {
    result = await getConsumerCommunicationPreference({
      storeSlug: store.slug,
      sessionToken: (await cookies()).get(CONSUMER_SESSION_COOKIE)?.value,
    });
  } catch {
    redirect(`/${store.slug}/account`);
  }
  return (
    <div className="storefront-page-bottom-safe">
      <StorePurchaseHeader
        backHref={`/${store.slug}/account`}
        backLabel="Voltar à conta"
        title="Comunicações"
        storeName={store.name}
        logoImageUrl={store.customization.assets.logo?.url ?? store.logoUrl}
        logoImageAssetId={store.customization.assets.logo?.id ?? null}
      />
      <main className="storefront-orders-main storefront-content-arrival">
        <ConsumerCommunicationPreferences
          storeSlug={store.slug}
          initialPreference={result.preference}
        />
      </main>
    </div>
  );
}

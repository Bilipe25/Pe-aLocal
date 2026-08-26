import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { MapPin, ReceiptText } from 'lucide-react';
import Link from 'next/link';

import { ConsumerLogoutButton } from '@/components/storefront/consumer-account-actions';
import { ConsumerEmailChange } from '@/components/storefront/consumer-email-change';
import { ConsumerSessions } from '@/components/storefront/consumer-sessions';
import { StorePurchaseHeader } from '@/components/storefront/store-purchase-header';
import {
  getConsumerVerificationMethod,
  isConsumerVerificationReady,
} from '@/server/consumer-verification/provider';
import { getPublicStoreShellBySlug } from '@/server/queries/public-store';
import {
  CONSUMER_SESSION_COOKIE,
  requireConsumerForStore,
} from '@/server/services/consumer-auth.service';

export const dynamic = 'force-dynamic';
export default async function ConsumerAccountPage({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params;
  const store = await getPublicStoreShellBySlug(storeSlug);
  if (!store) notFound();
  let authorized;
  try {
    authorized = await requireConsumerForStore({
      storeSlug: store.slug,
      sessionToken: (await cookies()).get(CONSUMER_SESSION_COOKIE)?.value,
    });
  } catch {
    redirect(`/${store.slug}/orders`);
  }
  return (
    <div className="storefront-page-bottom-safe">
      <StorePurchaseHeader
        backHref={`/${store.slug}/mais`}
        backLabel="Voltar a Mais"
        title="Minha conta"
        storeName={store.name}
        logoImageUrl={store.customization.assets.logo?.url ?? store.logoUrl}
        logoImageAssetId={store.customization.assets.logo?.id ?? null}
      />
      <main className="storefront-orders-main storefront-content-arrival">
        <h1 className="text-2xl font-bold">
          Olá
          {authorized.consumer.customer
            ? `, ${authorized.consumer.customer.name.split(' ')[0]}`
            : ''}
        </h1>
        <p className="text-text-secondary mt-1 text-sm">
          Acesse seus pedidos, endereços e aparelhos conectados.
        </p>
        <nav className="mt-6 grid gap-3" aria-label="Opções da conta">
          <Link
            href={`/${store.slug}/orders`}
            className="border-border bg-surface focus-visible:ring-brand-500 flex min-h-16 items-center gap-3 rounded-xl border p-4 font-semibold focus-visible:ring-2 focus-visible:outline-none"
          >
            <ReceiptText className="text-brand-600" aria-hidden="true" />
            Meus pedidos
          </Link>
          <Link
            href={`/${store.slug}/account/addresses`}
            className="border-border bg-surface focus-visible:ring-brand-500 flex min-h-16 items-center gap-3 rounded-xl border p-4 font-semibold focus-visible:ring-2 focus-visible:outline-none"
          >
            <MapPin className="text-brand-600" aria-hidden="true" />
            Meus endereços
          </Link>
        </nav>
        {authorized.scope.entitlement?.consumerConvenienceV2Enabled && (
          <>
            {authorized.consumer.emailNormalized &&
              isConsumerVerificationReady() &&
              getConsumerVerificationMethod() === 'email' && (
                <div className="border-border mt-8 border-t pt-6">
                  <ConsumerEmailChange
                    storeSlug={store.slug}
                    currentEmail={authorized.consumer.emailNormalized}
                  />
                </div>
              )}
            <div className="border-border mt-8 border-t pt-6">
              <ConsumerSessions storeSlug={store.slug} />
            </div>
          </>
        )}
        <div className="mt-8">
          <ConsumerLogoutButton storeSlug={store.slug} />
        </div>
      </main>
    </div>
  );
}

import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';

import { StorefrontMore } from '@/components/storefront/storefront-more';
import { getStorefrontCanonicalUrl } from '@/lib/storefront/urls';
import {
  getPublicDeliveryZones,
  getPublicOffers,
  getPublicStoreBySlug,
} from '@/server/queries/public-store';
import { AuthenticationError, NotFoundError } from '@/server/errors';
import {
  CONSUMER_SESSION_COOKIE,
  requireConsumerForStore,
} from '@/server/services/consumer-auth.service';
import { getConsumerLoyaltySummaryState } from '@/server/services/loyalty.service';

export const dynamic = 'force-dynamic';

interface MorePageProps {
  params: Promise<{ storeSlug: string }>;
}

export async function generateMetadata({ params }: MorePageProps): Promise<Metadata> {
  const { storeSlug } = await params;
  const store = await getPublicStoreBySlug(storeSlug);

  return {
    title: store ? `Mais | ${store.name}` : 'Mais',
    robots: {
      index: false,
      follow: false,
      noarchive: true,
      nocache: true,
    },
  };
}

function formatStorefrontEstimate(minMinutes: number, maxMinutes: number) {
  return minMinutes === maxMinutes
    ? `Pronto em ${minMinutes} min`
    : `Pronto em ${minMinutes}–${maxMinutes} min`;
}

async function hasVerifiedConsumer(storeSlug: string) {
  const sessionToken = (await cookies()).get(CONSUMER_SESSION_COOKIE)?.value;
  if (!sessionToken) return false;

  try {
    await requireConsumerForStore({ storeSlug, sessionToken });
    return true;
  } catch (error) {
    if (error instanceof AuthenticationError || error instanceof NotFoundError) return false;
    throw error;
  }
}

async function getMoreLoyaltyState(store: {
  id: string;
  tenantId: string;
  slug: string;
  timeZone: string;
}) {
  const sessionToken = (await cookies()).get(CONSUMER_SESSION_COOKIE)?.value;
  let identityId: string | null = null;
  if (sessionToken) {
    try {
      const verified = await requireConsumerForStore({ storeSlug: store.slug, sessionToken });
      identityId = verified.consumer.identityId;
    } catch (error) {
      if (!(error instanceof AuthenticationError) && !(error instanceof NotFoundError)) throw error;
    }
  }
  const state = await getConsumerLoyaltySummaryState({
    tenantId: store.tenantId,
    storeId: store.id,
    consumerIdentityId: identityId,
  });
  if (!state) return null;
  const promise = state.cycle ?? state.program;
  const promiseLabel = !promise
    ? null
    : promise.rewardType === 'FIXED_DISCOUNT'
      ? `${((promise.rewardValue ?? 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} de desconto`
      : promise.rewardType === 'PERCENT_DISCOUNT'
        ? `${(promise.percentageBasisPoints ?? 0) / 100}% de desconto`
        : `${promise.freeProductNameSnapshot ?? 'Produto'} grátis`;
  return {
    progress: state.cycle?.progress ?? 0,
    requiredOrders: state.cycle?.requiredOrders ?? state.program?.requiredOrders ?? 0,
    availableRewards: state.availableRewards,
    promiseLabel,
    nearestExpiryLabel: state.nearestExpiry
      ? new Intl.DateTimeFormat('pt-BR', {
          day: 'numeric',
          month: 'short',
          timeZone: store.timeZone,
        }).format(state.nearestExpiry)
      : null,
  };
}

export default async function MorePage({ params }: MorePageProps) {
  const { storeSlug } = await params;
  const store = await getPublicStoreBySlug(storeSlug);

  if (!store) notFound();
  if (store.slug !== storeSlug) redirect(`/${store.slug}/mais`);

  const deliveryZonesPromise = store.settings?.deliveryEnabled
    ? getPublicDeliveryZones(store.id)
    : Promise.resolve([]);
  const offerCountPromise = getPublicOffers(store.id, store.tenantId, store.timeZone).then(
    (offers) => offers.length,
  );
  const verifiedConsumerPromise = hasVerifiedConsumer(store.slug);
  const loyaltyStatePromise = getMoreLoyaltyState(store);
  const fullAddress =
    store.address && 'street' in store.address
      ? {
          street: store.address.street,
          number: store.address.number,
          complement: store.address.complement,
          neighborhood: store.address.neighborhood,
          city: store.address.city,
          state: store.address.state,
          zipCode: store.address.zipCode,
        }
      : null;
  const config = store.customization.config;
  const shareUrl = getStorefrontCanonicalUrl({
    slug: store.slug,
    canonicalUrl: config.seo.canonicalUrl,
    primaryDomainHostname: store.customization.primaryDomain?.hostname,
  });
  const logoUrl = store.customization.assets.logo?.url ?? store.logoUrl;
  const logoAssetId = store.customization.assets.logo?.id ?? null;
  const storeInfoPromise = deliveryZonesPromise.then((deliveryZones) => {
    const minDeliveryFee =
      deliveryZones.length > 0 ? Math.min(...deliveryZones.map((zone) => zone.fee)) : null;

    return {
      name: store.name,
      description: store.description,
      slogan: config.identity.slogan,
      aboutText: config.identity.aboutText,
      logoUrl,
      logoAssetId,
      availability: store.availability,
      estimatedTime: store.settings
        ? formatStorefrontEstimate(
            store.settings.estimatedTimeMinMinutes,
            store.settings.estimatedTimeMaxMinutes,
          )
        : null,
      minOrderValue: store.settings?.minOrderValue ?? null,
      deliveryEnabled: Boolean(store.settings?.deliveryEnabled && deliveryZones.length > 0),
      pickupEnabled: Boolean(store.settings?.pickupEnabled),
      minDeliveryFee,
      openingHours: store.openingHours,
      address: fullAddress,
      acceptsPix: Boolean(store.settings?.acceptsPix),
      acceptsCash: Boolean(store.settings?.acceptsCash),
      acceptsCardOnDelivery: Boolean(store.settings?.acceptsCardOnDelivery),
      phone: store.phone,
      whatsapp: store.whatsapp,
      shareUrl,
    };
  });

  return (
    <>
      <StorefrontMore
        storeId={store.id}
        storeSlug={store.slug}
        storeName={store.name}
        logoUrl={logoUrl}
        logoAssetId={logoAssetId}
        shareUrl={shareUrl}
        offerCount={offerCountPromise}
        hasVerifiedConsumer={verifiedConsumerPromise}
        storeInfo={storeInfoPromise}
        loyaltyState={loyaltyStatePromise}
      />
    </>
  );
}

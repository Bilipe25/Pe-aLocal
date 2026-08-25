import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';

import { ConsumerAddresses } from '@/components/storefront/consumer-addresses';
import { StorePurchaseHeader } from '@/components/storefront/store-purchase-header';
import { StorefrontBottomNav } from '@/components/storefront/storefront-bottom-nav';
import { getPublicPurchaseStoreBySlug } from '@/server/queries/public-store';
import { listConsumerAddresses } from '@/server/services/consumer-address.service';
import { CONSUMER_SESSION_COOKIE } from '@/server/services/consumer-auth.service';

export const dynamic = 'force-dynamic';
export default async function ConsumerAddressesPage({ params }: { params: Promise<{ storeSlug: string }> }) { const { storeSlug } = await params; const store = await getPublicPurchaseStoreBySlug(storeSlug); if (!store) notFound(); const token = (await cookies()).get(CONSUMER_SESSION_COOKIE)?.value; let addresses; try { addresses = await listConsumerAddresses({ storeSlug: store.slug, sessionToken: token }); } catch { redirect(`/${store.slug}/orders`); } return <div className="storefront-page-bottom-safe"><StorePurchaseHeader backHref={`/${store.slug}/account`} backLabel="Voltar à conta" title="Meus endereços" storeName={store.name} logoImageUrl={store.customization.assets.logo?.url ?? store.logoUrl} logoImageAssetId={store.customization.assets.logo?.id ?? null} /><main className="storefront-orders-main"><p className="text-text-secondary mb-5 text-sm">O frete e a área de entrega serão recalculados no checkout.</p><ConsumerAddresses storeSlug={store.slug} addresses={addresses} /></main><StorefrontBottomNav storeId={store.id} storeSlug={store.slug} /></div>; }

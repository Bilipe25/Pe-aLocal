'use client';

import {
  ChevronRight,
  Gift,
  Heart,
  Home,
  MapPin,
  Share2,
  Sparkles,
  Store,
  Ticket,
  UserRound,
} from 'lucide-react';
import Link from 'next/link';
import { Suspense, use, useEffect } from 'react';

import { StoreInfoSheet, type StoreInfoSheetProps } from '@/components/storefront/store-info-sheet';
import { ProductImage } from '@/components/storefront/product-image';
import { useOptionalStorefrontClientState } from '@/components/storefront/storefront-client-state-provider';
import { StorefrontMoreRowLoading } from '@/components/storefront/storefront-tab-loading';
import { StorefrontShareButton } from '@/components/storefront/storefront-share-button';
import { useFavoritesStore } from '@/stores/favorites-store';

type StorefrontMoreStoreInfo = Omit<StoreInfoSheetProps, 'trigger'>;

interface StorefrontMoreProps {
  storeId: string;
  storeSlug: string;
  storeName: string;
  logoUrl: string | null;
  logoAssetId: string | null;
  shareUrl: string;
  offerCount: number | Promise<number>;
  hasVerifiedConsumer: boolean | Promise<boolean>;
  storeInfo: StorefrontMoreStoreInfo | Promise<StorefrontMoreStoreInfo>;
  loyaltyState?:
    | { progress: number; requiredOrders: number; availableRewards: number }
    | null
    | Promise<{ progress: number; requiredOrders: number; availableRewards: number } | null>;
}

function useStreamedValue<T>(value: T | Promise<T>): T {
  return value instanceof Promise ? use(value) : value;
}

function MoreSectionHeader({
  icon: Icon,
  id,
  title,
}: {
  icon: typeof UserRound;
  id: string;
  title: string;
}) {
  return (
    <div className="storefront-more-section-heading">
      <Icon aria-hidden="true" />
      <h2 id={id}>{title}</h2>
    </div>
  );
}

function MoreRowContent({
  icon: Icon,
  title,
  description,
  badge,
  disabled = false,
}: {
  icon: typeof Heart;
  title: string;
  description: string;
  badge?: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <>
      <span className="storefront-more-row-icon" aria-hidden="true">
        <Icon />
      </span>
      <span className="storefront-more-row-copy">
        <strong>{title}</strong>
        <span>{description}</span>
      </span>
      <span className="storefront-more-row-trailing">
        {badge}
        {!disabled && <ChevronRight aria-hidden="true" />}
      </span>
    </>
  );
}

function FavoritesLink({ storeId, href }: { storeId: string; href: string }) {
  const shellState = useOptionalStorefrontClientState();
  const shellManagesStore = shellState?.storeId === storeId;
  const favoritesStoreId = useFavoritesStore((state) => state.storeId);
  const productIds = useFavoritesStore((state) => state.productIds);
  const setStore = useFavoritesStore((state) => state.setStore);
  const count = favoritesStoreId === storeId ? productIds.length : 0;

  useEffect(() => {
    if (shellManagesStore) return;
    setStore(storeId, []);
  }, [setStore, shellManagesStore, storeId]);

  return (
    <Link
      href={href}
      className="storefront-more-row"
      aria-label={
        count > 0
          ? `Favoritos, ${count} ${count === 1 ? 'produto salvo' : 'produtos salvos'}`
          : 'Favoritos, nenhum produto salvo'
      }
    >
      <MoreRowContent
        icon={Heart}
        title="Favoritos"
        description="Seus produtos salvos"
        badge={
          count > 0 ? (
            <span className="storefront-more-count" aria-hidden="true">
              {count > 99 ? '99+' : count}
            </span>
          ) : undefined
        }
      />
    </Link>
  );
}

function OffersLink({
  offerCount,
  catalogHref,
}: {
  offerCount: number | Promise<number>;
  catalogHref: string;
}) {
  const count = useStreamedValue(offerCount);

  return (
    <Link
      href={count > 0 ? `${catalogHref}#ofertas` : catalogHref}
      className="storefront-more-row storefront-content-arrival"
      aria-label={
        count > 0
          ? `Ofertas e cupons, ${count} ${count === 1 ? 'oferta disponível' : 'ofertas disponíveis'}`
          : 'Ofertas e cupons, ver cardápio'
      }
    >
      <MoreRowContent
        icon={Ticket}
        title="Ofertas e cupons"
        description={count > 0 ? 'Veja benefícios disponíveis' : 'Confira o cardápio da loja'}
        badge={
          count > 0 ? (
            <span className="storefront-more-count" aria-hidden="true">
              {count > 99 ? '99+' : count}
            </span>
          ) : undefined
        }
      />
    </Link>
  );
}

function StoreInfoRow({
  storeInfo,
}: {
  storeInfo: StorefrontMoreStoreInfo | Promise<StorefrontMoreStoreInfo>;
}) {
  const info = useStreamedValue(storeInfo);

  return (
    <StoreInfoSheet
      {...info}
      trigger={
        <button type="button" className="storefront-more-row storefront-content-arrival">
          <MoreRowContent
            icon={Store}
            title="Sobre a loja"
            description="Horários, entrega e endereço"
          />
        </button>
      }
    />
  );
}

function VerifiedConsumerSection({
  hasVerifiedConsumer,
  catalogHref,
}: {
  hasVerifiedConsumer: boolean | Promise<boolean>;
  catalogHref: string;
}) {
  if (!useStreamedValue(hasVerifiedConsumer)) return null;

  return (
    <section
      className="storefront-more-group storefront-content-arrival"
      aria-labelledby="more-your-data"
    >
      <MoreSectionHeader icon={UserRound} id="more-your-data" title="Seus dados" />
      <div className="storefront-more-list">
        <Link href={`${catalogHref}/account/addresses`} className="storefront-more-row">
          <MoreRowContent
            icon={MapPin}
            title="Meus endereços"
            description="Gerencie seus endereços de entrega"
          />
        </Link>
      </div>
    </section>
  );
}

export function StorefrontMore({
  storeId,
  storeSlug,
  storeName,
  logoUrl,
  logoAssetId,
  shareUrl,
  offerCount,
  hasVerifiedConsumer,
  storeInfo,
  loyaltyState = null,
}: StorefrontMoreProps) {
  const catalogHref = `/${storeSlug}`;

  return (
    <main className="storefront-more-main storefront-content-arrival">
      <header className="storefront-more-header">
        <Link
          href={catalogHref}
          className="storefront-more-home"
          aria-label={`Ir para o cardápio de ${storeName}`}
        >
          <Home aria-hidden="true" />
        </Link>
        <div className="storefront-more-heading-copy">
          <h1>Mais</h1>
          <p>Atalhos úteis para você e informações da loja</p>
        </div>
        <span className="storefront-more-logo" aria-label={`Logo de ${storeName}`}>
          <ProductImage
            name={storeName}
            imageUrl={logoUrl}
            imageAssetId={logoAssetId}
            sizes="64px"
            width={96}
            priority
            loading="eager"
            fallback={<Store />}
          />
        </span>
      </header>

      <section className="storefront-more-group" aria-labelledby="more-for-you">
        <MoreSectionHeader icon={UserRound} id="more-for-you" title="Para você" />
        <div className="storefront-more-list">
          <FavoritesLink storeId={storeId} href={`${catalogHref}/favorites`} />
          <Suspense fallback={<StorefrontMoreRowLoading label="Carregando ofertas…" />}>
            <OffersLink offerCount={offerCount} catalogHref={catalogHref} />
          </Suspense>
          <Suspense fallback={<StorefrontMoreRowLoading label="Carregando fidelidade…" />}>
            <LoyaltyLink state={loyaltyState} href={`${catalogHref}/loyalty`} />
          </Suspense>
        </div>
      </section>

      <section className="storefront-more-group" aria-labelledby="more-store">
        <MoreSectionHeader icon={Store} id="more-store" title="A loja" />
        <div className="storefront-more-list">
          <Suspense fallback={<StorefrontMoreRowLoading label="Carregando informações da loja…" />}>
            <StoreInfoRow storeInfo={storeInfo} />
          </Suspense>
          <StorefrontShareButton
            storeName={storeName}
            shareUrl={shareUrl}
            className="storefront-more-row"
            ariaLabel={`Compartilhar loja ${storeName}`}
          >
            <MoreRowContent
              icon={Share2}
              title="Compartilhar loja"
              description="Envie para alguém"
            />
          </StorefrontShareButton>
        </div>
      </section>

      <Suspense fallback={null}>
        <VerifiedConsumerSection
          hasVerifiedConsumer={hasVerifiedConsumer}
          catalogHref={catalogHref}
        />
      </Suspense>

      <aside className="storefront-more-callout" aria-labelledby="more-callout-title">
        <span className="storefront-more-callout-icon" aria-hidden="true">
          <Heart />
          <Sparkles />
        </span>
        <div>
          <h2 id="more-callout-title">Aproveite ao máximo!</h2>
          <p>Salve seus favoritos e encontre as ofertas da loja em um só lugar.</p>
        </div>
      </aside>
    </main>
  );
}

function LoyaltyLink({
  state,
  href,
}: {
  state: StorefrontMoreProps['loyaltyState'];
  href: string;
}) {
  const loyalty = useStreamedValue(state);
  if (!loyalty) return null;
  const description = loyalty.availableRewards
    ? `${loyalty.availableRewards} ${loyalty.availableRewards === 1 ? 'benefício disponível' : 'benefícios disponíveis'}`
    : loyalty.progress > 0
      ? `${loyalty.progress} de ${loyalty.requiredOrders} pedidos`
      : 'Faça seus pedidos e ganhe benefícios';
  return (
    <Link href={href} className="storefront-more-row storefront-content-arrival">
      <MoreRowContent icon={Gift} title="Fidelidade" description={description} />
    </Link>
  );
}

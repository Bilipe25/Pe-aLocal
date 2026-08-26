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
import { useEffect } from 'react';

import { StoreInfoSheet, type StoreInfoSheetProps } from '@/components/storefront/store-info-sheet';
import { ProductImage } from '@/components/storefront/product-image';
import { useOptionalStorefrontClientState } from '@/components/storefront/storefront-client-state-provider';
import { StorefrontShareButton } from '@/components/storefront/storefront-share-button';
import { useFavoritesStore } from '@/stores/favorites-store';

interface StorefrontMoreProps {
  storeId: string;
  storeSlug: string;
  storeName: string;
  logoUrl: string | null;
  logoAssetId: string | null;
  offerCount: number;
  hasVerifiedConsumer: boolean;
  storeInfo: Omit<StoreInfoSheetProps, 'trigger'>;
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

export function StorefrontMore({
  storeId,
  storeSlug,
  storeName,
  logoUrl,
  logoAssetId,
  offerCount,
  hasVerifiedConsumer,
  storeInfo,
}: StorefrontMoreProps) {
  const catalogHref = `/${storeSlug}`;

  return (
    <main className="storefront-more-main">
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
          <Link
            href={offerCount > 0 ? `${catalogHref}#ofertas` : catalogHref}
            className="storefront-more-row"
            aria-label={
              offerCount > 0
                ? `Ofertas e cupons, ${offerCount} ${offerCount === 1 ? 'oferta disponível' : 'ofertas disponíveis'}`
                : 'Ofertas e cupons, ver cardápio'
            }
          >
            <MoreRowContent
              icon={Ticket}
              title="Ofertas e cupons"
              description={
                offerCount > 0 ? 'Veja benefícios disponíveis' : 'Confira o cardápio da loja'
              }
              badge={
                offerCount > 0 ? (
                  <span className="storefront-more-count" aria-hidden="true">
                    {offerCount > 99 ? '99+' : offerCount}
                  </span>
                ) : undefined
              }
            />
          </Link>
          <div className="storefront-more-row is-disabled" aria-disabled="true">
            <MoreRowContent
              icon={Gift}
              title="Fidelidade"
              description="Benefícios para clientes frequentes"
              badge={<span className="storefront-more-coming-soon">Em breve</span>}
              disabled
            />
          </div>
        </div>
      </section>

      <section className="storefront-more-group" aria-labelledby="more-store">
        <MoreSectionHeader icon={Store} id="more-store" title="A loja" />
        <div className="storefront-more-list">
          <StoreInfoSheet
            {...storeInfo}
            trigger={
              <button type="button" className="storefront-more-row">
                <MoreRowContent
                  icon={Store}
                  title="Sobre a loja"
                  description="Horários, entrega e endereço"
                />
              </button>
            }
          />
          <StorefrontShareButton
            storeName={storeName}
            shareUrl={storeInfo.shareUrl}
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

      {hasVerifiedConsumer && (
        <section className="storefront-more-group" aria-labelledby="more-your-data">
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
      )}

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

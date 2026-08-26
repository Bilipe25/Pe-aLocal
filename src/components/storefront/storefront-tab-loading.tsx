import type { CSSProperties, ReactNode } from 'react';

type SkeletonElement = 'div' | 'span';

interface StorefrontSkeletonBlockProps {
  as?: SkeletonElement;
  className?: string;
  height?: string;
  width?: string;
}

function skeletonStyle(width?: string, height?: string): CSSProperties | undefined {
  if (!width && !height) return undefined;
  return {
    ...(width ? { '--skeleton-width': width } : {}),
    ...(height ? { '--skeleton-height': height } : {}),
  } as CSSProperties;
}

export function StorefrontSkeletonBlock({
  as: Element = 'span',
  className = '',
  height,
  width,
}: StorefrontSkeletonBlockProps) {
  return (
    <Element
      className={`storefront-skeleton-block ${className}`.trim()}
      style={skeletonStyle(width, height)}
    />
  );
}

export function StorefrontSkeletonLine({
  className = '',
  width,
}: Pick<StorefrontSkeletonBlockProps, 'className' | 'width'>) {
  return (
    <StorefrontSkeletonBlock className={`storefront-skeleton-line ${className}`} width={width} />
  );
}

export function StorefrontSkeletonCircle({
  className = '',
  size = '3rem',
}: {
  className?: string;
  size?: string;
}) {
  return (
    <StorefrontSkeletonBlock
      className={`storefront-skeleton-circle ${className}`}
      width={size}
      height={size}
    />
  );
}

function LoadingStatus({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className: string;
}) {
  return (
    <div className={className} role="status">
      <span className="sr-only">{label}</span>
      <div aria-hidden="true">{children}</div>
    </div>
  );
}

export function StorefrontSkeletonHeader({ title }: { title: string }) {
  return (
    <header className="storefront-loading-purchase-header">
      <StorefrontSkeletonBlock className="storefront-loading-back" />
      <StorefrontSkeletonCircle size="2.5rem" />
      <div className="storefront-loading-header-copy">
        <h1>{title}</h1>
        <StorefrontSkeletonLine width="7.5rem" />
      </div>
    </header>
  );
}

function MoreLoadingRow() {
  return (
    <div className="storefront-more-row storefront-loading-more-row">
      <StorefrontSkeletonCircle size="3rem" />
      <span className="storefront-loading-copy">
        <StorefrontSkeletonLine width="min(10rem, 72%)" />
        <StorefrontSkeletonLine width="min(13rem, 90%)" />
      </span>
      <StorefrontSkeletonBlock className="storefront-loading-chevron" />
    </div>
  );
}

export function StorefrontMoreRowLoading({ label = 'Carregando informação…' }: { label?: string }) {
  return (
    <div className="storefront-more-loading-slot" role="status" aria-live="off">
      <span className="sr-only">{label}</span>
      <div aria-hidden="true">
        <MoreLoadingRow />
      </div>
    </div>
  );
}

export function StorefrontMoreLoading() {
  return (
    <LoadingStatus
      label="Carregando atalhos da loja…"
      className="storefront-more-main storefront-page-bottom-safe storefront-route-loading"
    >
      <header className="storefront-more-header">
        <StorefrontSkeletonCircle className="storefront-loading-more-home" size="2.75rem" />
        <div className="storefront-more-heading-copy">
          <h1>Mais</h1>
          <p>Atalhos úteis para você e informações da loja</p>
        </div>
        <StorefrontSkeletonCircle size="3.5rem" />
      </header>

      <section className="storefront-more-group">
        <div className="storefront-more-section-heading">
          <StorefrontSkeletonCircle size="1.25rem" />
          <h2>Para você</h2>
        </div>
        <div className="storefront-more-list" data-loading-layout="more-personal">
          {Array.from({ length: 3 }, (_, index) => (
            <MoreLoadingRow key={index} />
          ))}
        </div>
      </section>

      <section className="storefront-more-group">
        <div className="storefront-more-section-heading">
          <StorefrontSkeletonCircle size="1.25rem" />
          <h2>A loja</h2>
        </div>
        <div className="storefront-more-list" data-loading-layout="more-store">
          {Array.from({ length: 2 }, (_, index) => (
            <MoreLoadingRow key={index} />
          ))}
        </div>
      </section>
    </LoadingStatus>
  );
}

function CartItemLoading() {
  return (
    <article className="storefront-loading-cart-item">
      <StorefrontSkeletonBlock className="storefront-loading-cart-image" />
      <div className="storefront-loading-cart-copy">
        <StorefrontSkeletonLine width="78%" />
        <StorefrontSkeletonLine width="56%" />
        <div className="storefront-loading-cart-line-footer">
          <StorefrontSkeletonLine width="4.75rem" />
          <div className="storefront-loading-quantity">
            <StorefrontSkeletonCircle size="1.75rem" />
            <StorefrontSkeletonLine width="0.75rem" />
            <StorefrontSkeletonCircle size="1.75rem" />
          </div>
        </div>
      </div>
    </article>
  );
}

export function StorefrontCartLoading() {
  return (
    <LoadingStatus
      label="Preparando sua sacola…"
      className="storefront-cart-page storefront-page-bottom-safe storefront-route-loading"
    >
      <StorefrontSkeletonHeader title="Sua sacola" />
      <div className="storefront-cart-heading storefront-loading-cart-heading">
        <StorefrontSkeletonLine width="6.5rem" />
        <StorefrontSkeletonLine width="7.5rem" />
      </div>
      <div className="storefront-cart-layout storefront-loading-cart-layout">
        <section className="storefront-cart-items" aria-labelledby="loading-cart-items-title">
          <div className="storefront-cart-section-heading">
            <h2 id="loading-cart-items-title">Itens do pedido</h2>
          </div>
          <div className="storefront-loading-cart-list" data-loading-layout="cart-items">
            {Array.from({ length: 3 }, (_, index) => (
              <CartItemLoading key={index} />
            ))}
          </div>
        </section>
        <section className="storefront-loading-cart-summary" aria-label="Resumo da sacola">
          <h2>Resumo</h2>
          <div>
            <span>Subtotal</span>
            <StorefrontSkeletonLine width="4.5rem" />
          </div>
          <div className="is-total">
            <strong>Total</strong>
            <StorefrontSkeletonLine width="5.5rem" />
          </div>
          <StorefrontSkeletonBlock className="storefront-loading-cart-cta" />
        </section>
      </div>
    </LoadingStatus>
  );
}

function OrderCardLoading({ compact = false }: { compact?: boolean }) {
  return (
    <article
      className={`storefront-loading-order-card${compact ? 'is-compact' : ''}`}
      data-loading-item="order"
    >
      <div className="storefront-loading-order-topline">
        <StorefrontSkeletonBlock className="storefront-loading-order-icon" />
        <div className="storefront-loading-order-heading">
          <span>
            Pedido #<StorefrontSkeletonLine width="3.75rem" />
          </span>
          <StorefrontSkeletonLine width="7.5rem" />
          {!compact ? <StorefrontSkeletonLine width="5.5rem" /> : null}
        </div>
        <StorefrontSkeletonLine width="4.75rem" />
      </div>
      <div className="storefront-loading-order-products">
        <StorefrontSkeletonLine width="88%" />
        <StorefrontSkeletonLine width="68%" />
      </div>
      {compact ? <StorefrontSkeletonBlock className="storefront-loading-order-action" /> : null}
    </article>
  );
}

export function StorefrontOrdersContentLoading({ standalone = false }: { standalone?: boolean }) {
  const content = (
    <div className="storefront-loading-orders-content" data-loading-layout="orders">
      <section>
        <h2>Em andamento</h2>
        <OrderCardLoading />
      </section>
      <section>
        <h2>Pedidos anteriores</h2>
        <div className="storefront-loading-order-list">
          <OrderCardLoading compact />
          <OrderCardLoading compact />
        </div>
      </section>
    </div>
  );

  if (!standalone) return content;
  return (
    <div role="status">
      <span className="sr-only">Atualizando seus pedidos…</span>
      <div aria-hidden="true">{content}</div>
    </div>
  );
}

export function StorefrontOrdersLoading() {
  return (
    <LoadingStatus
      label="Atualizando seus pedidos…"
      className="storefront-page-bottom-safe storefront-route-loading"
    >
      <div className="storefront-loading-page-shell">
        <StorefrontSkeletonHeader title="Meus pedidos" />
        <main className="storefront-orders-main">
          <StorefrontOrdersContentLoading />
        </main>
      </div>
    </LoadingStatus>
  );
}

function ProductCardLoading() {
  return (
    <article className="storefront-loading-product-card">
      <StorefrontSkeletonBlock className="storefront-loading-product-image" />
      <div className="storefront-loading-product-copy">
        <StorefrontSkeletonLine width="82%" />
        <StorefrontSkeletonLine width="96%" />
        <StorefrontSkeletonLine width="64%" />
        <div className="storefront-loading-product-footer">
          <StorefrontSkeletonLine width="4.5rem" />
          <StorefrontSkeletonCircle size="2.25rem" />
        </div>
      </div>
    </article>
  );
}

export function StorefrontFavoritesLoading() {
  return (
    <LoadingStatus
      label="Carregando seus favoritos…"
      className="storefront-page-bottom-safe storefront-route-loading"
    >
      <div className="storefront-loading-page-shell">
        <StorefrontSkeletonHeader title="Favoritos" />
        <main className="storefront-favorites-main">
          <div className="storefront-favorites-grid" data-loading-layout="favorites-grid">
            {Array.from({ length: 4 }, (_, index) => (
              <ProductCardLoading key={index} />
            ))}
          </div>
        </main>
      </div>
    </LoadingStatus>
  );
}

export function StorefrontAccountLoading() {
  return (
    <LoadingStatus
      label="Carregando sua conta…"
      className="storefront-page-bottom-safe storefront-route-loading"
    >
      <div className="storefront-loading-page-shell">
        <StorefrontSkeletonHeader title="Minha conta" />
        <main
          className="storefront-orders-main storefront-loading-account"
          data-loading-layout="account"
        >
          <StorefrontSkeletonLine className="storefront-loading-account-name" width="9rem" />
          <p>Acesse seus pedidos, endereços e aparelhos conectados.</p>
          <div className="storefront-loading-account-actions">
            {['Meus pedidos', 'Meus endereços'].map((label) => (
              <div key={label} className="storefront-loading-account-row">
                <StorefrontSkeletonCircle size="1.5rem" />
                <strong>{label}</strong>
              </div>
            ))}
          </div>
        </main>
      </div>
    </LoadingStatus>
  );
}

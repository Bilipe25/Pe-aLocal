import {
  StorefrontSkeletonBlock,
  StorefrontSkeletonLine,
} from '@/components/storefront/storefront-tab-loading';

function CatalogCardLoading({ featured = false }: { featured?: boolean }) {
  return (
    <article
      className={featured ? 'storefront-skeleton-featured-card' : 'storefront-skeleton-card'}
    >
      <StorefrontSkeletonBlock
        className={featured ? 'storefront-skeleton-featured-image' : 'storefront-skeleton-image'}
      />
      <div className="storefront-skeleton-copy">
        <StorefrontSkeletonLine width="72%" />
        <StorefrontSkeletonLine width="92%" />
        <StorefrontSkeletonLine width="38%" />
      </div>
    </article>
  );
}

export default function CatalogLoading() {
  return (
    <main className="storefront-skeleton storefront-route-loading" role="status">
      <span className="sr-only">Carregando o cardápio da loja…</span>
      <div aria-hidden="true">
        <div className="storefront-skeleton-search-row">
          <StorefrontSkeletonBlock className="storefront-skeleton-search" />
          <StorefrontSkeletonBlock className="storefront-skeleton-filter" />
        </div>
        <div className="storefront-skeleton-categories" data-loading-layout="catalog-categories">
          {Array.from({ length: 3 }, (_, index) => (
            <StorefrontSkeletonBlock key={index} />
          ))}
        </div>
        <section className="storefront-skeleton-section">
          <h2 className="storefront-loading-section-title">Destaques</h2>
          <div className="storefront-skeleton-featured" data-loading-layout="catalog-featured">
            {Array.from({ length: 2 }, (_, index) => (
              <CatalogCardLoading key={index} featured />
            ))}
          </div>
        </section>
        <section className="storefront-skeleton-section">
          <h2 className="storefront-loading-section-title">Cardápio</h2>
          <div className="storefront-skeleton-grid" data-loading-layout="catalog-products">
            {Array.from({ length: 4 }, (_, index) => (
              <CatalogCardLoading key={index} />
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

export default function StorefrontLoading() {
  return (
    <div className="storefront-skeleton" role="status" aria-live="polite">
      <span className="sr-only">Carregando o cardápio da loja...</span>
      <div aria-hidden="true">
        <div className="storefront-skeleton-search" />
        <div className="storefront-skeleton-categories">
          <span />
          <span />
          <span />
        </div>
        <div className="storefront-skeleton-section">
          <div className="storefront-skeleton-title" />
          <div className="storefront-skeleton-grid">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="storefront-skeleton-card">
                <div className="storefront-skeleton-image" />
                <div className="storefront-skeleton-copy">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

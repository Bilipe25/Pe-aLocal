interface StorefrontTabLoadingProps {
  label: string;
  titleWidth?: 'short' | 'medium' | 'long';
  rows?: number;
}

export function StorefrontTabLoading({
  label,
  titleWidth = 'medium',
  rows = 3,
}: StorefrontTabLoadingProps) {
  return (
    <main
      className="storefront-tab-loading storefront-page-bottom-safe"
      role="status"
      aria-live="polite"
    >
      <span className="sr-only">{label}</span>
      <div className="storefront-tab-loading-header" aria-hidden="true">
        <span className="storefront-tab-loading-back" />
        <span className={`storefront-tab-loading-title is-${titleWidth}`} />
        <span className="storefront-tab-loading-logo" />
      </div>
      <div className="storefront-tab-loading-list" aria-hidden="true">
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="storefront-tab-loading-row">
            <span className="storefront-tab-loading-icon" />
            <span className="storefront-tab-loading-copy">
              <span />
              <span />
            </span>
          </div>
        ))}
      </div>
    </main>
  );
}

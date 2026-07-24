import { StorefrontBannerImage } from '@/components/storefront/storefront-banner-image';
import type { PublicStorefrontBannerDto } from '@/types/storefront';

export function StoreBanners({ banners }: { banners: PublicStorefrontBannerDto[] }) {
  if (banners.length === 0) return null;

  return (
    <section className="storefront-banners" aria-label="Destaques da loja">
      {banners.map((banner) => (
        <article key={banner.id} className="storefront-banner">
          {banner.imageUrl && (
            <StorefrontBannerImage
              imageUrl={banner.imageUrl}
              imageAssetId={banner.imageAssetId}
              alt={banner.imageAlt}
            />
          )}
          <div className="storefront-banner-content">
            <h2>{banner.title}</h2>
            {banner.subtitle && <p>{banner.subtitle}</p>}
            {banner.href && banner.buttonText && (
              <a href={banner.href} className="storefront-banner-action">
                {banner.buttonText}
              </a>
            )}
          </div>
        </article>
      ))}
    </section>
  );
}

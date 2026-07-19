import { storeAssetSrcSet } from '@/features/assets/urls';

export interface PublicStoreBanner {
  id: string;
  title: string;
  subtitle: string | null;
  buttonText: string | null;
  href: string | null;
  imageAssetId: string | null;
  imageUrl: string | null;
  imageAlt: string;
}

export function StoreBanners({ banners }: { banners: PublicStoreBanner[] }) {
  if (banners.length === 0) return null;

  return (
    <section className="storefront-banners" aria-label="Destaques da loja">
      {banners.map((banner) => (
        <article key={banner.id} className="storefront-banner">
          {banner.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={banner.imageUrl}
              srcSet={
                banner.imageAssetId
                  ? storeAssetSrcSet(banner.imageAssetId, [384, 768, 1280])
                  : undefined
              }
              sizes="(min-width: 768px) 33vw, 100vw"
              alt={banner.imageAlt}
              width={1280}
              height={640}
              className="storefront-banner-image"
              loading="lazy"
              decoding="async"
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

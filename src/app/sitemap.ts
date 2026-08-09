import type { MetadataRoute } from 'next';

import { getPublicStorefrontSitemapEntries } from '@/server/queries/public-store';
import { getSiteUrl, getStorefrontUrl } from '@/lib/storefront/urls';

export const revalidate = 300;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const stores = await getPublicStorefrontSitemapEntries();

  return [
    {
      url: getSiteUrl().toString(),
      changeFrequency: 'monthly' as const,
      priority: 1,
    },
    ...stores.map((store) => ({
      url: getStorefrontUrl(store.slug),
      lastModified: store.lastModified,
      changeFrequency: 'daily' as const,
      priority: 0.8,
    })),
  ];
}

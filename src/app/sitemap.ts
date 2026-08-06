import type { MetadataRoute } from 'next';

import { getPublicStorefrontSitemapEntries } from '@/server/queries/public-store';
import { getStorefrontUrl } from '@/lib/storefront/urls';

export const revalidate = 300;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const stores = await getPublicStorefrontSitemapEntries();

  return stores.map((store) => ({
    url: getStorefrontUrl(store.slug),
    lastModified: store.lastModified,
    changeFrequency: 'daily',
    priority: 0.8,
  }));
}

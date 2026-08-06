import type { MetadataRoute } from 'next';

import { getSitemapUrl } from '@/lib/storefront/urls';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/api/',
        '/admin/',
        '/dashboard/',
        '/access-pending',
        '/access-denied',
        '/*/cart',
        '/*/checkout',
        '/*/order/',
      ],
    },
    sitemap: getSitemapUrl(),
  };
}

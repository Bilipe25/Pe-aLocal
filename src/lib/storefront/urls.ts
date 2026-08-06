interface StorefrontCanonicalUrlOptions {
  slug: string;
  canonicalUrl?: string | null;
  primaryDomainHostname?: string | null;
}

export function getSiteUrl() {
  const configuredUrl = process.env.APP_URL ?? 'http://localhost:3000';
  try {
    return new URL(configuredUrl);
  } catch {
    return new URL('http://localhost:3000');
  }
}

export function getStorefrontCanonicalUrl({
  slug,
  canonicalUrl,
  primaryDomainHostname,
}: StorefrontCanonicalUrlOptions) {
  if (canonicalUrl) return canonicalUrl;
  if (primaryDomainHostname) return `https://${primaryDomainHostname}/`;
  return new URL(`/${encodeURIComponent(slug)}`, getSiteUrl()).toString();
}

export function getStorefrontUrl(slug: string) {
  return new URL(`/${encodeURIComponent(slug)}`, getSiteUrl()).toString();
}

export function getSitemapUrl() {
  return new URL('/sitemap.xml', getSiteUrl()).toString();
}

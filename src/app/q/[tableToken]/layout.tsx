import type { Metadata, Viewport } from 'next';

import { getStorefrontThemeStyle, storefrontLayoutClass } from '@/features/customization/theme';
import { getDineInStorefrontContext } from '@/server/services/dine-in-storefront.service';

export const metadata: Metadata = {
  robots: { index: false, follow: false, noarchive: true, nocache: true },
  referrer: 'no-referrer',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default async function DineInLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tableToken: string }>;
}) {
  const { tableToken } = await params;
  const context = await getDineInStorefrontContext(tableToken);
  if (context.state !== 'READY') return children;
  const config = context.store.customization.config;

  return (
    <div
      className={`storefront-theme ${storefrontLayoutClass(config)} storefront-button-${config.typography.buttonStyle} storefront-cart-${config.layout.cartPresentation.toLowerCase()} min-h-screen`}
      style={getStorefrontThemeStyle(config)}
      data-dine-in-context="true"
    >
      {children}
    </div>
  );
}

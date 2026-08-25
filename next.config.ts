import type { NextConfig } from 'next';
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants';
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare';
import { config as loadEnvironmentFile } from 'dotenv';

const HYPERDRIVE_LOCAL_CONNECTION_ENV = 'CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE';
const HYPERDRIVE_FRESH_LOCAL_CONNECTION_ENV =
  'CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE_FRESH';

if (process.env.NODE_ENV === 'development') {
  loadEnvironmentFile({ path: '.env.local', override: false, quiet: true });
  if (process.env.DATABASE_URL && !process.env[HYPERDRIVE_LOCAL_CONNECTION_ENV]) {
    process.env[HYPERDRIVE_LOCAL_CONNECTION_ENV] = process.env.DATABASE_URL;
  }
  if (process.env.DATABASE_URL && !process.env[HYPERDRIVE_FRESH_LOCAL_CONNECTION_ENV]) {
    process.env[HYPERDRIVE_FRESH_LOCAL_CONNECTION_ENV] = process.env.DATABASE_URL;
  }
}

const nextConfig: NextConfig = {
  serverExternalPackages: ['@prisma/client', '.prisma/client', 'pg-cloudflare'],

  async redirects() {
    return [{ source: '/offline', destination: '/offline.html', permanent: false }];
  },

  // Otimizações de imagem
  //
  // O runtime é OpenNext/Cloudflare Workers, onde o otimizador de imagem nativo
  // do Next.js não roda. Usamos um loader custom que aponta para a rota pública
  // /api/store-assets/[assetId], a qual já invoca o binding IMAGES (Cloudflare
  // Images) no edge — gerando AVIF/WebP e resize sob demanda. As larguras em
  // `deviceSizes` existem em `STORE_ASSET_ALLOWED_WIDTHS` para garantir que
  // cada variante do `srcset` seja servida pela rota, sem recorrer ao fallback
  // do asset original.
  images: {
    loader: 'custom',
    loaderFile: 'src/lib/images/cloudflare-images.ts',
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [96, 192, 384, 768, 1280],
    imageSizes: [],
    remotePatterns: [
      // Supabase Storage
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
      // Vercel Blob
      {
        protocol: 'https',
        hostname: '*.public.blob.vercel-storage.com',
      },
    ],
  },

  // Headers de segurança adicionais
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
        ],
      },
      {
        source: '/:storeSlug/order/:token',
        headers: [
          { key: 'Cache-Control', value: 'private, no-store, max-age=0' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' },
        ],
      },
      {
        source: '/:storeSlug/cart',
        headers: [
          { key: 'Cache-Control', value: 'private, no-store, max-age=0' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' },
        ],
      },
      {
        source: '/:storeSlug/checkout',
        headers: [
          { key: 'Cache-Control', value: 'private, no-store, max-age=0' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' },
        ],
      },
      {
        source: '/:storeSlug/orders/:path*',
        headers: [
          { key: 'Cache-Control', value: 'private, no-store, max-age=0' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' },
        ],
      },
      {
        source: '/:storeSlug/account/:path*',
        headers: [
          { key: 'Cache-Control', value: 'private, no-store, max-age=0' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' },
        ],
      },
      {
        source: '/dashboard/:path*',
        headers: [{ key: 'Cache-Control', value: 'private, no-store, max-age=0' }],
      },
      {
        source: '/admin/:path*',
        headers: [{ key: 'Cache-Control', value: 'private, no-store, max-age=0' }],
      },
      {
        source: '/auth/:path*',
        headers: [{ key: 'Cache-Control', value: 'private, no-store, max-age=0' }],
      },
      {
        source: '/api/auth/:path*',
        headers: [{ key: 'Cache-Control', value: 'private, no-store, max-age=0' }],
      },
      {
        source: '/q/:path*',
        headers: [
          { key: 'Cache-Control', value: 'private, no-store, max-age=0' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' },
        ],
      },
      {
        source: '/login',
        headers: [{ key: 'Cache-Control', value: 'private, no-store, max-age=0' }],
      },
      {
        source: '/forgot-password',
        headers: [{ key: 'Cache-Control', value: 'private, no-store, max-age=0' }],
      },
      {
        source: '/reset-password',
        headers: [{ key: 'Cache-Control', value: 'private, no-store, max-age=0' }],
      },
      {
        source: '/offline.html',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' },
        ],
      },
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
        ],
      },
      {
        source: '/pwa/:asset*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
    ];
  },

  // Logs de build reduzidos em produção
  logging: {
    fetches: {
      fullUrl: true,
    },
  },
};

export default function configureNext(phase: string): NextConfig {
  if (phase === PHASE_DEVELOPMENT_SERVER) {
    void initOpenNextCloudflareForDev();
  }

  return nextConfig;
}

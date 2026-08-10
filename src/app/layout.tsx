import type { Metadata, Viewport } from 'next';
import { Bricolage_Grotesque, Inter, Space_Mono } from 'next/font/google';
import { Toaster } from 'sonner';
import { ServiceWorkerRegistration } from '@/components/pwa/service-worker-registration';
import './globals.css';

const bricolage = Bricolage_Grotesque({
  subsets: ['latin'],
  variable: '--font-bricolage',
  weight: ['700'],
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const spaceMono = Space_Mono({
  subsets: ['latin'],
  variable: '--font-space-mono',
  weight: ['700'],
  display: 'swap',
  preload: false,
});

export const metadata: Metadata = {
  title: {
    default: 'PedidoLocal — Sua lanchonete online',
    template: '%s | PedidoLocal',
  },
  description:
    'Monte sua loja virtual própria. Receba pedidos diretamente pelo celular, sem comissões de marketplace.',
  keywords: ['pedido online', 'lanchonete', 'cardápio digital', 'delivery', 'comida'],
  authors: [{ name: 'PedidoLocal' }],
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/pwa/pedidolocal-icon-v1-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/pwa/pedidolocal-icon-v1-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/pwa/apple-touch-icon-v1-180.png', sizes: '180x180', type: 'image/png' }],
  },
  appleWebApp: {
    capable: true,
    title: 'PedidoLocal',
    statusBarStyle: 'default',
  },
  openGraph: {
    type: 'website',
    locale: 'pt_BR',
    siteName: 'PedidoLocal',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#D9480F',
  colorScheme: 'light',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className={`${bricolage.variable} ${inter.variable} ${spaceMono.variable}`}>
      <body className="bg-papel font-body text-tinta min-h-screen antialiased">
        {children}
        <ServiceWorkerRegistration />
        <Toaster
          position="top-right"
          richColors
          closeButton
          toastOptions={{
            duration: 4000,
          }}
        />
      </body>
    </html>
  );
}

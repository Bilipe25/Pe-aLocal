import type { Metadata, Viewport } from 'next';
import { Bricolage_Grotesque, Inter, Space_Mono } from 'next/font/google';
import { Toaster } from 'sonner';
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
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${bricolage.variable} ${inter.variable} ${spaceMono.variable}`}
    >
      <body className="min-h-screen bg-papel font-body text-tinta antialiased">
        {children}
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

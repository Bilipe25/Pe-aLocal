import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Toaster } from 'sonner';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className={inter.variable}>
      <body className="min-h-screen bg-surface font-sans text-text-primary antialiased">
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

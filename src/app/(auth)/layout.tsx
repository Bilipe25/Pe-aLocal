import { Store } from 'lucide-react';
import Link from 'next/link';

export const metadata = {
  title: 'Entrar',
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="auth-shell bg-surface-secondary min-h-dvh lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(28rem,0.82fr)]">
      <section className="lg:bg-surface-highlight flex px-4 pt-6 sm:px-8 sm:pt-8 lg:min-h-dvh lg:flex-col lg:justify-between lg:p-12 xl:p-16">
        <Link
          href="/"
          aria-label="Ir para a página inicial do PedidoLocal"
          className="font-display text-brand-700 hover:text-brand-600 mx-auto flex min-h-11 w-fit items-center gap-2 transition-colors lg:mx-0"
        >
          <Store className="h-8 w-8" aria-hidden="true" />
          <span className="text-2xl font-bold">PedidoLocal</span>
        </Link>

        <div className="hidden max-w-xl lg:block">
          <p className="font-display text-text-primary text-4xl leading-tight font-bold text-balance xl:text-5xl">
            Uma operação própria, simples de administrar.
          </p>
          <p className="text-text-secondary mt-5 max-w-lg text-lg leading-8 text-pretty">
            Centralize pedidos, catálogo e rotina da sua loja sem depender de marketplace.
          </p>
        </div>

        <p className="text-text-secondary hidden text-sm font-medium lg:block">
          Comprar com facilidade. Vender com autonomia.
        </p>
      </section>

      <section className="flex items-start justify-center px-4 pt-6 pb-8 sm:px-8 sm:pt-10 sm:pb-12 lg:min-h-dvh lg:items-center lg:p-12">
        <div className="w-full max-w-md">{children}</div>
      </section>
    </main>
  );
}

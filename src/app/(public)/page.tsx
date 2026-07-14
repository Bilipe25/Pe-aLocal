import { Store, ArrowRight, Smartphone, Shield, Zap } from 'lucide-react';
import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      {/* Header */}
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <Store className="h-6 w-6 text-brand-500" />
            <span className="text-xl font-bold text-text-primary">PedidoLocal</span>
          </div>
          <Link
            href="/login"
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-600"
          >
            Entrar
          </Link>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-4 py-20 text-center">
          <h1 className="text-4xl font-bold tracking-tight text-text-primary sm:text-5xl md:text-6xl">
            Sua lanchonete online
            <span className="block text-brand-500">sem comissões</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-text-secondary">
            Monte sua loja virtual própria em minutos. Receba pedidos diretamente pelo celular, sem
            depender de marketplace. Simples, rápido e acessível.
          </p>
          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-6 py-3 text-base font-semibold text-white shadow-md transition-all hover:bg-brand-600 hover:shadow-lg"
            >
              Começar agora
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/burger-do-ze"
              className="inline-flex items-center gap-2 rounded-lg border border-border px-6 py-3 text-base font-medium text-text-primary transition-colors hover:bg-surface-tertiary"
            >
              Ver loja de exemplo
            </Link>
          </div>
        </section>

        {/* Features */}
        <section className="border-t border-border bg-surface-secondary py-20">
          <div className="mx-auto max-w-6xl px-4">
            <div className="grid gap-8 md:grid-cols-3">
              <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-brand-50 text-brand-500">
                  <Smartphone className="h-6 w-6" />
                </div>
                <h3 className="mb-2 text-lg font-semibold text-text-primary">Mobile-first</h3>
                <p className="text-sm text-text-secondary">
                  Funciona perfeitamente em qualquer celular. Seus clientes fazem pedidos em
                  segundos.
                </p>
              </div>

              <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-success-light text-success">
                  <Shield className="h-6 w-6" />
                </div>
                <h3 className="mb-2 text-lg font-semibold text-text-primary">Sem comissões</h3>
                <p className="text-sm text-text-secondary">
                  Diferente de marketplaces, você não paga comissão por pedido. O lucro é todo seu.
                </p>
              </div>

              <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-info-light text-info">
                  <Zap className="h-6 w-6" />
                </div>
                <h3 className="mb-2 text-lg font-semibold text-text-primary">Rápido e simples</h3>
                <p className="text-sm text-text-secondary">
                  Configure em minutos. Cadastre o cardápio, publique e comece a receber pedidos.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-surface py-8">
        <div className="mx-auto max-w-6xl px-4 text-center text-sm text-text-muted">
          &copy; {new Date().getFullYear()} PedidoLocal. Todos os direitos reservados.
        </div>
      </footer>
    </div>
  );
}

import type { Metadata } from 'next';
import { ArrowRight, Check, ExternalLink, Smartphone, Store, Utensils } from 'lucide-react';
import Link from 'next/link';

import { getSiteUrl } from '@/lib/storefront/urls';

const demoStoreSlug = process.env.NEXT_PUBLIC_DEMO_STORE_SLUG ?? 'burger-do-ze';
const demoStorePath = `/${encodeURIComponent(demoStoreSlug)}`;

export const metadata: Metadata = {
  title: 'Loja própria para o seu negócio local',
  description:
    'Tenha uma vitrine própria, receba pedidos diretamente dos seus clientes e opere com autonomia, sem comissões de marketplace.',
  alternates: {
    canonical: getSiteUrl().toString(),
  },
  openGraph: {
    title: 'Loja própria para o seu negócio local | PedidoLocal',
    description:
      'Tenha uma vitrine própria, receba pedidos diretamente dos seus clientes e opere com autonomia.',
    url: getSiteUrl().toString(),
    type: 'website',
  },
};

export default function HomePage() {
  return (
    <div className="bg-surface text-text-primary flex min-h-screen flex-col">
      <header className="border-border bg-surface sticky top-0 z-10 border-b">
        <div className="mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link
            href="/"
            className="flex min-h-11 shrink-0 items-center gap-2 rounded-lg px-1 focus-visible:outline-offset-4"
            aria-label="PedidoLocal — página inicial"
          >
            <Store className="text-brand-500 h-6 w-6" aria-hidden="true" />
            <span className="text-xl font-bold tracking-tight">PedidoLocal</span>
          </Link>

          <nav aria-label="Acesso" className="flex items-center gap-2">
            <Link
              href="/access-help"
              className="text-text-secondary hover:bg-surface-secondary hover:text-text-primary hidden min-h-11 items-center rounded-lg px-3 text-sm font-medium transition-colors sm:inline-flex"
            >
              Solicitar acesso
            </Link>
            <Link
              href="/login"
              className="bg-brand-600 hover:bg-brand-700 inline-flex min-h-11 items-center rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors"
            >
              Entrar no painel
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <section className="border-border border-b">
          <div className="mx-auto grid max-w-6xl min-w-0 gap-12 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[1.02fr_0.98fr] lg:items-center lg:gap-16">
            <div className="min-w-0">
              <p className="text-brand-600 text-sm font-semibold tracking-wide uppercase">
                Para quem pede e para quem atende
              </p>
              <h1 className="font-display mt-4 max-w-xl text-4xl leading-[1.05] font-bold tracking-tight text-balance sm:text-5xl md:text-6xl">
                Seu negócio local{' '}
                <span className="text-brand-600 block">online, do seu jeito.</span>
              </h1>
              <p className="text-text-secondary mt-6 max-w-xl text-base leading-7 sm:text-lg">
                Tenha uma vitrine própria, receba pedidos diretamente dos seus clientes e opere com
                autonomia, sem comissões de marketplace.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <Link
                  href={demoStorePath}
                  className="bg-brand-600 hover:bg-brand-700 inline-flex min-h-12 items-center justify-center gap-2 rounded-lg px-5 py-3 text-base font-semibold text-white shadow-sm transition-colors"
                >
                  Quero pedir
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
                <Link
                  href="/login"
                  className="border-border bg-surface hover:bg-surface-secondary inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border px-5 py-3 text-base font-semibold transition-colors"
                >
                  Tenho um estabelecimento
                </Link>
              </div>

              <div className="text-text-secondary mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                <Link
                  href="/access-help"
                  className="text-brand-600 hover:text-brand-700 inline-flex min-h-11 items-center gap-1 font-semibold underline-offset-4 hover:underline"
                >
                  Solicitar acesso
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
                <span aria-hidden="true" className="text-border">
                  •
                </span>
                <span>Sem comissões de marketplace</span>
              </div>
            </div>

            <div className="min-w-0 lg:pl-2">
              <Link
                href={demoStorePath}
                className="border-border bg-surface group block max-w-full min-w-0 rounded-2xl border p-4 shadow-md transition-shadow hover:shadow-lg focus-visible:outline-offset-4 sm:p-5"
                aria-label="Abrir a vitrine publicada de demonstração"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="bg-brand-50 text-brand-600 flex h-12 w-12 shrink-0 items-center justify-center rounded-xl">
                      <Store className="h-6 w-6" aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-brand-600 text-xs font-semibold tracking-wide uppercase">
                        Vitrine publicada
                      </p>
                      <p className="mt-1 truncate text-lg font-bold">Loja de demonstração</p>
                    </div>
                  </div>
                  <ExternalLink
                    className="text-text-muted group-hover:text-brand-500 h-5 w-5 shrink-0 transition-colors"
                    aria-hidden="true"
                  />
                </div>

                <div
                  className="border-border bg-surface-secondary mt-5 overflow-hidden rounded-xl border"
                  aria-hidden="true"
                >
                  <div className="bg-tinta flex items-center gap-2 px-4 py-3">
                    <div className="bg-brand-500 h-7 w-7 rounded-lg" />
                    <div className="h-2.5 w-28 rounded-full bg-white/75" />
                    <div className="ml-auto h-7 w-16 rounded-full border border-white/30" />
                  </div>
                  <div className="bg-surface px-4 py-4">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="bg-text-primary h-3 w-32 rounded-full" />
                        <div className="bg-text-muted mt-2 h-2.5 w-44 max-w-full rounded-full" />
                      </div>
                      <div className="bg-success-light text-success rounded-full px-2.5 py-1 text-[10px] font-bold">
                        Cardápio online
                      </div>
                    </div>
                    <div className="mt-5 grid grid-cols-3 gap-2">
                      {['Cardápio', 'Pedido', 'Entrega'].map((label) => (
                        <div key={label} className="border-border rounded-lg border p-2.5">
                          <div className="bg-brand-100 h-14 rounded-md" />
                          <div className="bg-text-muted mt-2 h-2 w-12 rounded-full" />
                          <span className="sr-only">{label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="text-text-secondary mt-4 flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0">Vitrine real para explorar</span>
                  <span className="text-brand-600 inline-flex shrink-0 items-center gap-1 font-semibold">
                    Abrir vitrine <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                </div>
              </Link>
            </div>
          </div>
        </section>

        <section aria-labelledby="workflow-title" className="bg-surface-secondary">
          <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-16">
            <div className="max-w-2xl">
              <p className="text-brand-600 text-sm font-semibold tracking-wide uppercase">
                O balcão digital do bairro
              </p>
              <h2
                id="workflow-title"
                className="font-display mt-3 text-3xl font-bold tracking-tight sm:text-4xl"
              >
                Do cardápio ao pedido, sem desvio.
              </h2>
              <p className="text-text-secondary mt-3 max-w-xl leading-7">
                O cliente encontra sua vitrine e pede direto. A equipe organiza o cardápio e a
                operação em um só lugar.
              </p>
            </div>

            <div className="mt-10 grid gap-4 md:grid-cols-3">
              <article className="border-border bg-surface rounded-xl border p-5 shadow-sm">
                <div className="text-brand-600 flex items-center gap-3">
                  <span className="font-mono text-sm font-bold" aria-hidden="true">
                    01
                  </span>
                  <Utensils className="h-5 w-5" aria-hidden="true" />
                </div>
                <h3 className="mt-5 text-lg font-bold">Configure o cardápio</h3>
                <p className="text-text-secondary mt-2 text-sm leading-6">
                  Organize produtos, adicionais e disponibilidade para a rotina real da sua loja.
                </p>
              </article>

              <article className="border-border bg-surface rounded-xl border p-5 shadow-sm">
                <div className="text-brand-600 flex items-center gap-3">
                  <span className="font-mono text-sm font-bold" aria-hidden="true">
                    02
                  </span>
                  <Store className="h-5 w-5" aria-hidden="true" />
                </div>
                <h3 className="mt-5 text-lg font-bold">Publique sua vitrine</h3>
                <p className="text-text-secondary mt-2 text-sm leading-6">
                  Compartilhe um endereço próprio para seus clientes acessarem pelo celular.
                </p>
              </article>

              <article className="border-border bg-surface rounded-xl border p-5 shadow-sm">
                <div className="text-brand-600 flex items-center gap-3">
                  <span className="font-mono text-sm font-bold" aria-hidden="true">
                    03
                  </span>
                  <Smartphone className="h-5 w-5" aria-hidden="true" />
                </div>
                <h3 className="mt-5 text-lg font-bold">Receba pedidos diretos</h3>
                <p className="text-text-secondary mt-2 text-sm leading-6">
                  Acompanhe cada pedido e mantenha a operação sob o controle da sua equipe.
                </p>
              </article>
            </div>

            <div className="border-border bg-surface mt-8 flex flex-col gap-4 rounded-xl border p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="bg-success-light text-success mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full">
                  <Check className="h-4 w-4" aria-hidden="true" />
                </div>
                <div>
                  <p className="font-semibold">Pronto para conhecer?</p>
                  <p className="text-text-secondary mt-1 text-sm">
                    Veja como uma vitrine publicada funciona na prática.
                  </p>
                </div>
              </div>
              <Link
                href={demoStorePath}
                className="text-brand-600 hover:bg-brand-50 inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold transition-colors"
              >
                Abrir vitrine publicada
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-border bg-surface border-t">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-6 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="text-text-secondary">
            © {new Date().getFullYear()} PedidoLocal. O balcão digital do bairro.
          </p>
          <nav aria-label="Links do rodapé" className="flex flex-wrap gap-x-4 gap-y-2">
            <Link
              href="/login"
              className="text-text-secondary hover:text-text-primary inline-flex min-h-11 items-center underline-offset-4 hover:underline"
            >
              Entrar no painel
            </Link>
            <Link
              href="/access-help"
              className="text-text-secondary hover:text-text-primary inline-flex min-h-11 items-center underline-offset-4 hover:underline"
            >
              Solicitar acesso
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

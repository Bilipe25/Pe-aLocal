import { Store } from 'lucide-react';
import Link from 'next/link';
// TODO: Fase 4 — import { notFound } from 'next/navigation';

interface StorePageProps {
  params: Promise<{ storeSlug: string }>;
}

export async function generateMetadata({ params }: StorePageProps) {
  const { storeSlug } = await params;
  return {
    title: `${storeSlug} | PedidoLocal`,
    description: `Faça seu pedido em ${storeSlug}`,
  };
}

export default async function StorePage({ params }: StorePageProps) {
  const { storeSlug } = await params;

  // TODO: Fase 4 — buscar loja pelo slug no banco
  // const store = await getStoreBySlug(storeSlug);
  // if (!store) notFound();

  return (
    <div className="min-h-screen bg-surface-secondary">
      {/* Header da loja */}
      <header className="border-b border-border bg-surface">
        <div className="mx-auto max-w-3xl px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50">
              <Store className="h-6 w-6 text-brand-500" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-text-primary">{storeSlug}</h1>
              <p className="text-sm text-text-muted">Loja pública — Fase 4</p>
            </div>
          </div>
        </div>
      </header>

      {/* Conteúdo placeholder */}
      <main className="mx-auto max-w-3xl px-4 py-8">
        <div className="rounded-xl border border-warning bg-warning-light p-6 text-center">
          <p className="text-sm font-medium text-warning">
            🚧 Loja pública em construção
          </p>
          <p className="mt-2 text-xs text-text-secondary">
            O cardápio, carrinho e checkout serão implementados nas Fases 3-5.
          </p>
          <p className="mt-1 text-xs text-text-muted">
            Slug: <code className="rounded bg-surface px-1 py-0.5 font-mono">{storeSlug}</code>
          </p>
        </div>

        <div className="mt-6 text-center">
          <Link
            href="/"
            className="text-sm text-brand-500 transition-colors hover:text-brand-600"
          >
            ← Voltar ao início
          </Link>
        </div>
      </main>
    </div>
  );
}

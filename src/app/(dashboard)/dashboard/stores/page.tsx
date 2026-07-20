import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Building2, Store } from 'lucide-react';

import { PageHeader } from '@/components/shared/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { selectStoreAction } from '@/features/stores/actions';
import { listAccessibleStores } from '@/server/services/store-context.service';

export const metadata = { title: 'Unidades' };

const STATUS_MAP = {
  OPEN: { label: 'Aberta', variant: 'success' as const },
  CLOSED: { label: 'Fechada', variant: 'destructive' as const },
  PAUSED: { label: 'Pausada', variant: 'warning' as const },
};

export default async function StoresPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const rawPage = Number((await searchParams).page ?? '1');
  const stores = await listAccessibleStores({
    page: Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1,
    pageSize: 20,
  });

  if (stores.total === 1 && stores.items[0]) {
    redirect(`/dashboard/stores/${stores.items[0].id}`);
  }

  const pageCount = Math.ceil(stores.total / stores.pageSize);

  return (
    <div>
      <PageHeader
        title="Unidades"
        description="Escolha qual loja deseja administrar. A seleção é sempre validada no servidor."
      />

      {stores.total === 0 ? (
        <section className="border-border bg-surface rounded-xl border p-6 text-center">
          <Building2 className="text-text-muted mx-auto h-8 w-8" aria-hidden="true" />
          <h2 className="text-text-primary mt-3 text-lg font-semibold">Nenhuma loja disponível</h2>
          <p className="text-text-secondary mx-auto mt-1 max-w-xl text-sm">
            Seu estabelecimento ainda não possui uma unidade vinculada. Solicite a criação ao
            administrador da plataforma.
          </p>
        </section>
      ) : (
        <>
          <div
            className="divide-border border-border bg-surface divide-y overflow-hidden rounded-xl border"
            aria-label="Lojas disponíveis"
          >
            {stores.items.map((store) => {
              const status = STATUS_MAP[store.status];
              return (
                <form
                  key={store.id}
                  action={selectStoreAction}
                  className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:px-5"
                >
                  <input type="hidden" name="storeId" value={store.id} />
                  <span className="bg-brand-50 text-brand-700 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg">
                    <Store aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-text-primary font-semibold">{store.name}</span>
                      <Badge variant={status.variant}>{status.label}</Badge>
                      {!store.isActive && <Badge variant="secondary">Inativa</Badge>}
                    </span>
                    <span className="text-text-secondary mt-1 block truncate text-sm">
                      /{store.slug}
                    </span>
                  </span>
                  <Button type="submit" variant="outline" className="w-full sm:w-auto">
                    Administrar unidade
                  </Button>
                </form>
              );
            })}
          </div>

          {pageCount > 1 && (
            <nav className="mt-4 flex items-center justify-between gap-3" aria-label="Paginação">
              {stores.page > 1 ? (
                <Button asChild variant="outline">
                  <Link href={`/dashboard/stores?page=${stores.page - 1}`}>Anterior</Link>
                </Button>
              ) : (
                <span />
              )}
              <span className="text-text-secondary text-sm">
                Página {stores.page} de {pageCount}
              </span>
              {stores.page < pageCount ? (
                <Button asChild variant="outline">
                  <Link href={`/dashboard/stores?page=${stores.page + 1}`}>Próxima</Link>
                </Button>
              ) : (
                <span />
              )}
            </nav>
          )}
        </>
      )}
    </div>
  );
}

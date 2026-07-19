import { ChevronLeft, ChevronRight, Eye, Search, X } from 'lucide-react';
import Link from 'next/link';

import { TenantStatusBadge } from '@/components/admin/tenant-status-badge';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getAdminTenantsData } from '@/server/services/admin.service';

export const metadata = { title: 'Estabelecimentos' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function pageHref(filters: { query?: string; status?: string; sort?: string }, page: number) {
  const params = new URLSearchParams();
  if (filters.query) params.set('query', filters.query);
  if (filters.status) params.set('status', filters.status);
  if (filters.sort && filters.sort !== 'newest') params.set('sort', filters.sort);
  if (page > 1) params.set('page', String(page));
  const query = params.toString();
  return query ? `/admin/tenants?${query}` : '/admin/tenants';
}

export default async function AdminTenantsPage({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  const filters = {
    query: first(raw.query),
    status: first(raw.status),
    sort: first(raw.sort),
    page: first(raw.page),
  };
  const { total, tenants, page, pageCount } = await getAdminTenantsData(filters);
  const hasFilters = Boolean(
    filters.query || filters.status || (filters.sort && filters.sort !== 'newest'),
  );

  return (
    <div className="space-y-6">
      <header>
        <p className="text-brand-600 text-sm font-medium">Administração geral</p>
        <h1 className="text-text-primary text-2xl font-bold text-balance">Estabelecimentos</h1>
        <p className="text-text-secondary mt-1 max-w-3xl text-sm text-pretty">
          Encontre um estabelecimento pelo nome da empresa, da loja ou pelo endereço do cardápio.
        </p>
      </header>

      <form
        action="/admin/tenants"
        method="get"
        className="border-border bg-surface grid gap-4 rounded-xl border p-4 lg:grid-cols-[minmax(260px,1fr)_180px_190px_auto] lg:items-end"
      >
        <label className="text-text-secondary grid min-w-0 gap-1.5 text-sm">
          Buscar estabelecimento
          <span className="relative">
            <Search
              className="text-text-muted pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2"
              aria-hidden="true"
            />
            <input
              name="query"
              defaultValue={filters.query}
              maxLength={120}
              placeholder="Nome, loja ou endereço"
              className="border-border bg-surface text-text-primary placeholder:text-text-muted min-h-11 w-full rounded-md border pr-3 pl-10"
            />
          </span>
        </label>
        <label className="text-text-secondary grid gap-1.5 text-sm">
          Status
          <select
            name="status"
            defaultValue={filters.status ?? ''}
            className="border-border bg-surface text-text-primary min-h-11 rounded-md border px-3"
          >
            <option value="">Todos</option>
            <option value="ACTIVE">Ativos</option>
            <option value="SUSPENDED">Suspensos</option>
            <option value="PENDING">Pendentes</option>
          </select>
        </label>
        <label className="text-text-secondary grid gap-1.5 text-sm">
          Ordenar por
          <select
            name="sort"
            defaultValue={filters.sort ?? 'newest'}
            className="border-border bg-surface text-text-primary min-h-11 rounded-md border px-3"
          >
            <option value="newest">Mais recentes</option>
            <option value="name">Nome (A–Z)</option>
          </select>
        </label>
        <div className="flex gap-2">
          <button type="submit" className={cn(buttonVariants(), 'min-h-11 flex-1 lg:flex-none')}>
            Aplicar filtros
          </button>
          {hasFilters && (
            <Link
              href="/admin/tenants"
              aria-label="Limpar filtros"
              title="Limpar filtros"
              className={buttonVariants({
                variant: 'outline',
                className: 'min-h-11 min-w-11 px-3',
              })}
            >
              <X aria-hidden="true" />
            </Link>
          )}
        </div>
      </form>

      <section className="border-border bg-surface overflow-hidden rounded-xl border">
        <div className="border-border border-b px-5 py-4">
          <h2 className="text-text-primary font-semibold">
            {total === 1 ? '1 estabelecimento encontrado' : `${total} estabelecimentos encontrados`}
          </h2>
          <p className="text-text-secondary text-sm">
            Página {Math.min(page, pageCount)} de {pageCount} · até 20 resultados por página.
          </p>
        </div>

        {tenants.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <h3 className="text-text-primary font-semibold">Nenhum estabelecimento encontrado</h3>
            <p className="text-text-secondary mx-auto mt-1 max-w-md text-sm">
              Revise o termo buscado ou limpe os filtros para consultar todos os cadastros.
            </p>
            {(hasFilters || page > 1) && (
              <Link
                href={page > 1 ? pageHref(filters, 1) : '/admin/tenants'}
                className={cn(buttonVariants({ variant: 'outline' }), 'mt-4')}
              >
                {page > 1 ? 'Voltar à primeira página' : 'Limpar filtros'}
              </Link>
            )}
          </div>
        ) : (
          <>
            <ul className="divide-border divide-y md:hidden">
              {tenants.map((tenant) => (
                <li key={tenant.id} className="space-y-4 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-text-primary font-semibold break-words">{tenant.name}</h3>
                      <p className="text-text-secondary mt-1 text-sm">
                        {tenant._count.members} acessos · {tenant._count.stores} lojas
                      </p>
                    </div>
                    <TenantStatusBadge status={tenant.status} />
                  </div>
                  <Link
                    href={`/admin/tenants/${tenant.id}`}
                    className={buttonVariants({ variant: 'outline', className: 'min-h-11 w-full' })}
                  >
                    <Eye aria-hidden="true" /> Ver detalhes
                  </Link>
                </li>
              ))}
            </ul>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[680px] text-left text-sm">
                <thead className="bg-surface-secondary text-text-secondary">
                  <tr>
                    <th className="px-5 py-3 font-medium">Estabelecimento</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                    <th className="px-5 py-3 font-medium">Acessos</th>
                    <th className="px-5 py-3 font-medium">Lojas</th>
                    <th className="px-5 py-3 text-right font-medium">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-border divide-y">
                  {tenants.map((tenant) => (
                    <tr key={tenant.id}>
                      <td className="text-text-primary max-w-md px-5 py-4 font-medium break-words">
                        {tenant.name}
                      </td>
                      <td className="px-5 py-4">
                        <TenantStatusBadge status={tenant.status} />
                      </td>
                      <td className="text-text-secondary px-5 py-4">{tenant._count.members}</td>
                      <td className="text-text-secondary px-5 py-4">{tenant._count.stores}</td>
                      <td className="px-5 py-4 text-right">
                        <Link
                          href={`/admin/tenants/${tenant.id}`}
                          className={buttonVariants({ variant: 'outline', size: 'sm' })}
                        >
                          <Eye aria-hidden="true" /> Ver detalhes
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tenants.length > 0 && pageCount > 1 && (
          <nav
            aria-label="Paginação dos estabelecimentos"
            className="border-border flex items-center justify-between gap-3 border-t px-5 py-4"
          >
            {page > 1 ? (
              <Link
                href={pageHref(filters, page - 1)}
                className={buttonVariants({ variant: 'outline', size: 'sm' })}
              >
                <ChevronLeft aria-hidden="true" /> Anterior
              </Link>
            ) : (
              <span />
            )}
            <span className="text-text-secondary text-sm">
              {page} de {pageCount}
            </span>
            {page < pageCount ? (
              <Link
                href={pageHref(filters, page + 1)}
                className={buttonVariants({ variant: 'outline', size: 'sm' })}
              >
                Próxima <ChevronRight aria-hidden="true" />
              </Link>
            ) : (
              <span />
            )}
          </nav>
        )}
      </section>
    </div>
  );
}

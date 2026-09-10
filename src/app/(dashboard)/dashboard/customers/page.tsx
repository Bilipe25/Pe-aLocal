import { ArrowDownUp, RotateCcw, Search, UserRoundSearch, UsersRound } from 'lucide-react';
import Link from 'next/link';

import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CUSTOMER_RELATIONSHIP_LABELS } from '@/domain/customers/relationship';
import { formatCurrency } from '@/lib/utils';
import { listCustomersV1 } from '@/server/services/customers-v1.service';

export const metadata = { title: 'Clientes' };

const legacyLabels = {
  NEW: 'Novo',
  RECURRING: 'Recorrente',
  LAPSED: 'Faz tempo que não pede',
} as const;

function queryHref(input: { search?: string; segment?: string; sort?: string; page?: number }) {
  const params = new URLSearchParams();
  if (input.search) params.set('search', input.search);
  if (input.segment && input.segment !== 'ALL') params.set('segment', input.segment);
  if (input.sort && input.sort !== 'RECENT') params.set('sort', input.sort);
  if (input.page && input.page > 1) params.set('page', String(input.page));
  const query = params.toString();
  return `/dashboard/customers${query ? `?${query}` : ''}`;
}

function lastOrderCopy(days: number | null) {
  if (days == null) return 'Sem pedido concluído';
  if (days === 0) return 'Último pedido hoje';
  if (days === 1) return 'Último pedido ontem';
  return `Último pedido há ${days} dias`;
}

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; page?: string; segment?: string; sort?: string }>;
}) {
  const query = await searchParams;
  const parsedPage = Number(query.page ?? '1');
  const page = Number.isSafeInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const result = await listCustomersV1({
    search: query.search,
    page,
    segment: query.segment,
    sort: query.sort,
  });
  const relationshipShortcuts = [
    { key: 'NEW', label: 'Novos', value: result.summary.new },
    { key: 'FREQUENT', label: 'Frequentes', value: result.summary.frequent },
    { key: 'COOLING', label: 'Estão sumindo', value: result.summary.cooling },
    { key: 'INACTIVE', label: 'Não pedem há tempo', value: result.summary.inactive },
    { key: 'RECOVERED', label: 'Voltaram', value: result.summary.recovered },
  ] as const;
  const legacySummaries = [
    { label: 'Clientes', value: result.summary.total },
    { label: 'Recorrentes', value: result.summary.recurring },
    ...(result.v2Enabled
      ? [{ label: 'Voltaram este mês', value: result.summary.returnedThisMonth }]
      : []),
    { label: 'Sem pedir há 60+ dias', value: result.summary.lapsed },
  ];

  return (
    <div>
      <PageHeader
        title="Clientes"
        description={
          result.relationshipEnabled
            ? `Veja quem chegou, quem volta e quem precisa de atenção em ${result.store.name}.`
            : `Quem compra e volta em ${result.store.name}.`
        }
      />

      {result.relationshipEnabled && result.summary.cooling + result.summary.inactive > 0 ? (
        <section className="bg-surface-tertiary border-border mb-5 flex flex-col gap-4 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <UserRoundSearch className="text-brand-600 mt-0.5 size-5 shrink-0" aria-hidden="true" />
            <div>
              <h2 className="font-semibold">
                {result.summary.cooling + result.summary.inactive}{' '}
                {result.summary.cooling + result.summary.inactive === 1
                  ? 'cliente está'
                  : 'clientes estão'}{' '}
                há mais tempo sem voltar
              </h2>
              <p className="text-text-secondary mt-1 text-sm">
                A classificação considera o ritmo de pedidos de cada pessoa, sem adivinhações.
              </p>
            </div>
          </div>
          {result.loyaltyEnabled ? (
            <Button asChild className="shrink-0">
              <Link href="/dashboard/customers/return">
                <RotateCcw aria-hidden="true" />
                Trazer de volta
              </Link>
            </Button>
          ) : null}
        </section>
      ) : null}

      <form className="flex max-w-3xl flex-col gap-2 sm:flex-row" action="/dashboard/customers">
        <label className="relative flex-1">
          <span className="sr-only">Buscar por nome ou telefone</span>
          <Search
            className="text-text-muted pointer-events-none absolute top-3.5 left-3 h-4 w-4"
            aria-hidden="true"
          />
          <Input
            name="search"
            defaultValue={query.search ?? ''}
            className="pl-10"
            placeholder="Buscar cliente"
            maxLength={80}
          />
        </label>
        {result.relationshipEnabled ? (
          <label className="relative sm:w-52">
            <span className="sr-only">Ordenar clientes</span>
            <ArrowDownUp
              className="text-text-muted pointer-events-none absolute top-3.5 left-3 size-4"
              aria-hidden="true"
            />
            <select
              name="sort"
              defaultValue={result.sort}
              className="border-border bg-surface focus-visible:ring-brand-500 h-11 w-full rounded-lg border py-2 pr-3 pl-10 text-sm focus-visible:ring-2 focus-visible:outline-none"
            >
              <option value="RECENT">Mais recentes</option>
              <option value="FREQUENT">Mais frequentes</option>
              <option value="ATTENTION">Precisam de atenção</option>
            </select>
          </label>
        ) : null}
        {result.relationshipEnabled && result.segment !== 'ALL' ? (
          <input type="hidden" name="segment" value={result.segment} />
        ) : null}
        <Button type="submit" variant="outline">
          Buscar
        </Button>
      </form>

      {result.relationshipEnabled ? (
        <nav className="mt-5 grid grid-cols-2 gap-2 lg:grid-cols-5" aria-label="Grupos de clientes">
          {relationshipShortcuts.map((shortcut) => {
            const active = result.segment === shortcut.key;
            return (
              <Link
                key={shortcut.key}
                href={queryHref({
                  search: query.search,
                  segment: active ? 'ALL' : shortcut.key,
                  sort: result.sort,
                })}
                aria-current={active ? 'page' : undefined}
                className={`focus-visible:ring-brand-500 flex min-h-16 items-center justify-between gap-3 rounded-xl border px-3 py-2 focus-visible:ring-2 focus-visible:outline-none ${
                  active
                    ? 'border-brand-500 bg-surface-tertiary text-text-primary'
                    : 'border-border bg-surface hover:bg-surface-secondary'
                }`}
              >
                <span className="text-sm font-medium">{shortcut.label}</span>
                <strong className="font-mono text-lg">{shortcut.value}</strong>
              </Link>
            );
          })}
        </nav>
      ) : (
        <dl
          className={`border-border mt-5 grid divide-x rounded-xl border ${legacySummaries.length === 4 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'}`}
        >
          {legacySummaries.map((summary) => (
            <div key={summary.label} className="p-4">
              <dt className="text-text-secondary text-xs">{summary.label}</dt>
              <dd className="mt-1 font-mono text-xl font-bold">{summary.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {result.items.length ? (
        <ul className="border-border bg-surface mt-6 divide-y rounded-xl border">
          {result.items.map((customer) => (
            <li key={customer.id}>
              <Link
                href={`/dashboard/customers/${customer.id}`}
                className="hover:bg-surface-secondary focus-visible:ring-brand-500 grid min-h-20 gap-3 p-4 focus-visible:ring-2 focus-visible:outline-none sm:grid-cols-[minmax(0,1fr)_10rem_10rem] sm:items-center"
              >
                <div className="min-w-0">
                  <span className="block truncate font-semibold">{customer.name}</span>
                  {customer.classification ? (
                    <span className="text-text-secondary mt-1 block text-sm">
                      {customer.classification === 'LAPSED'
                        ? legacyLabels.LAPSED
                        : result.relationshipEnabled
                          ? CUSTOMER_RELATIONSHIP_LABELS[customer.classification]
                          : legacyLabels[customer.classification as keyof typeof legacyLabels]}
                    </span>
                  ) : null}
                </div>
                <span className="text-text-secondary text-sm">
                  <strong className="text-text-primary block font-mono">
                    {customer.completedOrders}
                  </strong>
                  {customer.completedOrders === 1 ? 'pedido concluído' : 'pedidos concluídos'}
                </span>
                <span className="text-text-secondary text-sm">
                  <strong className="text-text-primary block font-medium">
                    {result.relationshipEnabled
                      ? lastOrderCopy(customer.lastOrderDaysAgo)
                      : customer.lastOrderAt
                        ? new Intl.DateTimeFormat('pt-BR').format(customer.lastOrderAt)
                        : '—'}
                  </strong>
                  {result.relationshipEnabled
                    ? `Já pediu ${formatCurrency(customer.totalSpent)}`
                    : 'última compra'}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="border-border mt-6 rounded-xl border p-8 text-center">
          <UsersRound className="text-text-muted mx-auto" aria-hidden="true" />
          <h2 className="mt-3 font-bold">Nenhum cliente encontrado</h2>
          <p className="text-text-secondary mt-1 text-sm">
            {result.relationshipEnabled && result.segment !== 'ALL'
              ? 'Este grupo está vazio agora. Escolha outro grupo ou limpe a busca.'
              : 'Tente o início do nome ou o telefone completo.'}
          </p>
        </div>
      )}

      <nav className="mt-4 flex justify-between" aria-label="Paginação de clientes">
        {page > 1 ? (
          <Button asChild variant="outline">
            <Link
              href={queryHref({
                search: query.search,
                segment: result.segment,
                sort: result.sort,
                page: page - 1,
              })}
            >
              Anterior
            </Link>
          </Button>
        ) : (
          <span />
        )}
        {page * 25 < result.total ? (
          <Button asChild variant="outline">
            <Link
              href={queryHref({
                search: query.search,
                segment: result.segment,
                sort: result.sort,
                page: page + 1,
              })}
            >
              Próxima
            </Link>
          </Button>
        ) : null}
      </nav>
    </div>
  );
}

import { AuditAction } from '@prisma/client';
import {
  Activity,
  Ban,
  Building2,
  Download,
  Eye,
  LifeBuoy,
  Search,
  ShieldCheck,
  Users,
} from 'lucide-react';
import Link from 'next/link';

import { TenantStatusAction } from '@/components/admin/tenant-status-action';
import { TenantStatusBadge } from '@/components/admin/tenant-status-badge';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getAdminDashboardData } from '@/server/services/admin.service';

function formatDate(value: Date) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Fortaleza',
  }).format(value);
}

function auditHref(input: { query?: string; action?: string; page?: number }) {
  const params = new URLSearchParams();
  if (input.query) params.set('auditQuery', input.query);
  if (input.action) params.set('auditAction', input.action);
  if (input.page && input.page > 1) params.set('auditPage', String(input.page));
  const query = params.toString();
  return query ? `/admin?${query}#audit-log-heading` : '/admin#audit-log-heading';
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ auditQuery?: string; auditAction?: string; auditPage?: string }>;
}) {
  const params = await searchParams;
  const filters = {
    query: params.auditQuery,
    action: params.auditAction,
    page: params.auditPage,
  };
  const { metrics, tenants, audit } = await getAdminDashboardData(filters);
  const cards = [
    {
      label: 'Estabelecimentos',
      value: metrics.totalTenants,
      icon: Building2,
      iconClass: 'text-info',
    },
    { label: 'Ativos', value: metrics.activeTenants, icon: Activity, iconClass: 'text-success' },
    { label: 'Suspensos', value: metrics.suspendedTenants, icon: Ban, iconClass: 'text-error' },
    { label: 'Usuários', value: metrics.totalUsers, icon: Users, iconClass: 'text-info' },
  ];

  return (
    <div className="space-y-8">
      <div>
        <p className="text-brand-600 text-sm font-medium">Plataforma</p>
        <h1 className="text-text-primary text-2xl font-bold">Administração geral</h1>
        <p className="text-text-secondary mt-1 text-sm">
          Visão operacional dos estabelecimentos, usuários e eventos administrativos.
        </p>
      </div>

      <section
        aria-label="Métricas da plataforma"
        className="border-border bg-surface grid grid-cols-2 overflow-hidden rounded-xl border lg:grid-cols-4"
      >
        {cards.map((card) => (
          <article
            key={card.label}
            className="border-border min-w-0 border-b p-4 odd:border-r nth-[3]:border-b-0 nth-[4]:border-b-0 sm:p-5 lg:border-r lg:border-b-0 lg:last:border-r-0"
          >
            <div className="flex items-center justify-between">
              <span className="text-text-secondary text-sm">{card.label}</span>
              <card.icon className={`h-5 w-5 ${card.iconClass}`} aria-hidden="true" />
            </div>
            <p className="text-text-primary mt-3 text-3xl font-bold">{card.value}</p>
          </article>
        ))}
      </section>

      <section className="border-border bg-surface overflow-hidden rounded-xl border shadow-sm">
        <div className="border-border border-b px-5 py-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-text-primary text-lg font-semibold">Estabelecimentos recentes</h2>
              <p className="text-text-secondary text-sm">
                Os 10 cadastros mais recentes da plataforma.
              </p>
            </div>
            <Link
              href="/admin/tenants"
              className="text-brand-600 flex min-h-11 items-center text-sm font-medium hover:underline"
            >
              Buscar estabelecimentos
            </Link>
          </div>
        </div>
        <ul className="divide-border divide-y md:hidden">
          {tenants.map((tenant) => (
            <li key={tenant.id} className="space-y-4 p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-text-primary font-semibold break-words">{tenant.name}</h3>
                  <p className="text-text-secondary mt-1 text-sm">
                    {tenant._count.members} usuários · {tenant._count.stores} lojas
                  </p>
                  <p className="text-text-muted mt-1 text-xs">
                    Criado em {formatDate(tenant.createdAt)}
                  </p>
                </div>
                <TenantStatusBadge status={tenant.status} />
              </div>
              <div className="grid gap-2 sm:flex">
                <Link
                  href={`/admin/tenants/${tenant.id}`}
                  className={cn(
                    buttonVariants({ variant: 'outline', size: 'sm' }),
                    'w-full sm:w-auto',
                  )}
                >
                  <Eye aria-hidden="true" /> Visualizar
                </Link>
                <TenantStatusAction
                  tenantId={tenant.id}
                  tenantName={tenant.name}
                  status={tenant.status}
                  compact
                />
              </div>
            </li>
          ))}
          {tenants.length === 0 && (
            <li className="text-text-muted px-5 py-10 text-center text-sm">
              Nenhum estabelecimento cadastrado.
            </li>
          )}
        </ul>
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-surface-secondary text-text-secondary">
              <tr>
                <th className="px-5 py-3 font-medium">Estabelecimento</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Usuários</th>
                <th className="px-5 py-3 font-medium">Lojas</th>
                <th className="px-5 py-3 font-medium">Criado em</th>
                <th className="px-5 py-3 text-right font-medium">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {tenants.map((tenant) => (
                <tr key={tenant.id}>
                  <td className="text-text-primary px-5 py-4 font-medium">{tenant.name}</td>
                  <td className="px-5 py-4">
                    <TenantStatusBadge status={tenant.status} />
                  </td>
                  <td className="text-text-secondary px-5 py-4">{tenant._count.members}</td>
                  <td className="text-text-secondary px-5 py-4">{tenant._count.stores}</td>
                  <td className="text-text-secondary px-5 py-4">{formatDate(tenant.createdAt)}</td>
                  <td className="px-5 py-4">
                    <div className="flex justify-end gap-2">
                      <Link
                        href={`/admin/tenants/${tenant.id}`}
                        className={buttonVariants({ variant: 'outline', size: 'sm' })}
                      >
                        <Eye aria-hidden="true" />
                        Visualizar
                      </Link>
                      <TenantStatusAction
                        tenantId={tenant.id}
                        tenantName={tenant.name}
                        status={tenant.status}
                      />
                    </div>
                  </td>
                </tr>
              ))}
              {tenants.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-text-muted px-5 py-10 text-center">
                    Nenhum estabelecimento cadastrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
        <section className="border-border bg-surface overflow-hidden rounded-xl border shadow-sm">
          <div className="border-border border-b px-5 py-4">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
              <div>
                <h2 id="audit-log-heading" className="text-text-primary text-lg font-semibold">
                  Logs de auditoria
                </h2>
                <p className="text-text-secondary text-sm">
                  {audit.total} {audit.total === 1 ? 'evento encontrado' : 'eventos encontrados'}.
                </p>
              </div>
              <a
                href={`/admin/audit/export?${new URLSearchParams({
                  ...(filters.query ? { query: filters.query } : {}),
                  ...(filters.action ? { action: filters.action } : {}),
                }).toString()}`}
                className={buttonVariants({ variant: 'outline', size: 'sm' })}
              >
                <Download aria-hidden="true" /> Exportar CSV
              </a>
            </div>
            <form
              action="/admin"
              method="GET"
              className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_14rem_auto]"
            >
              <label className="relative">
                <span className="sr-only">Buscar nos logs</span>
                <Search
                  className="text-text-muted pointer-events-none absolute top-3.5 left-3 h-4 w-4"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  name="auditQuery"
                  defaultValue={filters.query}
                  placeholder="Entidade, loja, usuário ou ID"
                  className="border-border bg-surface min-h-11 w-full rounded-md border pr-3 pl-9 text-sm"
                />
              </label>
              <label>
                <span className="sr-only">Filtrar por ação</span>
                <select
                  name="auditAction"
                  defaultValue={filters.action ?? ''}
                  className="border-border bg-surface min-h-11 w-full rounded-md border px-3 text-sm"
                >
                  <option value="">Todas as ações</option>
                  {Object.values(AuditAction).map((action) => (
                    <option key={action} value={action}>
                      {action}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" className={buttonVariants({ size: 'sm' })}>
                Filtrar
              </button>
            </form>
          </div>
          <div
            className="max-h-[480px] overflow-auto"
            role="region"
            aria-labelledby="audit-log-heading"
            tabIndex={0}
          >
            <ul className="divide-border divide-y">
              {audit.logs.map((log) => (
                <li key={log.id} className="px-5 py-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-text-primary font-medium">{log.action}</span>
                    <time className="text-text-muted text-xs">{formatDate(log.createdAt)}</time>
                  </div>
                  <p className="text-text-secondary mt-1 text-xs">
                    {log.user?.email ?? 'Sistema'} · {log.tenant?.name ?? 'Plataforma'} ·{' '}
                    {log.entity}
                  </p>
                  <p className="text-text-muted mt-1 text-xs">
                    {log.store ? `${log.store.name} (/${log.store.slug})` : 'Sem loja associada'}
                    {log.entityId ? ` · ID ${log.entityId}` : ''}
                  </p>
                  {log.metadata && (
                    <details className="mt-2">
                      <summary className="text-brand-700 focus-visible:ring-brand-500 inline-flex min-h-11 cursor-pointer items-center rounded-md text-xs font-medium focus-visible:ring-2 focus-visible:outline-none">
                        Ver detalhes estruturados
                      </summary>
                      <pre className="bg-surface-secondary text-text-secondary max-h-48 overflow-auto rounded-md p-3 text-xs break-words whitespace-pre-wrap">
                        {JSON.stringify(log.metadata, null, 2)}
                      </pre>
                    </details>
                  )}
                </li>
              ))}
              {audit.logs.length === 0 && (
                <li className="text-text-muted px-5 py-10 text-center text-sm">
                  Nenhum evento registrado.
                </li>
              )}
            </ul>
          </div>
          {audit.pageCount > 1 && (
            <nav
              aria-label="Páginas dos logs de auditoria"
              className="border-border flex items-center justify-between gap-3 border-t px-5 py-3"
            >
              <Link
                href={auditHref({
                  query: filters.query,
                  action: filters.action,
                  page: audit.page - 1,
                })}
                aria-disabled={audit.page <= 1}
                className={cn(
                  buttonVariants({ variant: 'outline', size: 'sm' }),
                  audit.page <= 1 && 'pointer-events-none opacity-50',
                )}
              >
                Anterior
              </Link>
              <span className="text-text-secondary text-xs">
                Página {audit.page} de {audit.pageCount}
              </span>
              <Link
                href={auditHref({
                  query: filters.query,
                  action: filters.action,
                  page: audit.page + 1,
                })}
                aria-disabled={audit.page >= audit.pageCount}
                className={cn(
                  buttonVariants({ variant: 'outline', size: 'sm' }),
                  audit.page >= audit.pageCount && 'pointer-events-none opacity-50',
                )}
              >
                Próxima
              </Link>
            </nav>
          )}
        </section>

        <section className="border-border bg-surface rounded-xl border p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <LifeBuoy className="text-info h-5 w-5" />
            <h2 className="text-text-primary text-lg font-semibold">Ferramentas de suporte</h2>
          </div>
          <p className="text-text-secondary mt-2 text-sm">
            Diagnóstico somente leitura. Alterações operacionais permanecem restritas às ações de
            status auditadas.
          </p>
          <ul className="mt-5 space-y-3 text-sm">
            <li className="bg-surface-secondary text-text-secondary flex items-center gap-2 rounded-lg p-3">
              <ShieldCheck className="text-info h-4 w-4" /> Perfis e acessos da equipe
            </li>
            <li className="bg-surface-secondary text-text-secondary flex items-center gap-2 rounded-lg p-3">
              <Building2 className="text-info h-4 w-4" /> Lojas vinculadas
            </li>
            <li className="text-text-muted text-xs">
              Abra um estabelecimento em “Visualizar” para consultar os dados.
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}

import type { TenantStatus } from '@prisma/client';
import { Activity, Ban, Building2, Eye, LifeBuoy, ShieldCheck, Users } from 'lucide-react';
import Link from 'next/link';

import { changeTenantStatusAction } from '@/features/admin/actions';
import { getAdminDashboardData } from '@/server/services/admin.service';

const STATUS_LABEL: Record<TenantStatus, string> = {
  ACTIVE: 'Ativo',
  SUSPENDED: 'Suspenso',
  PENDING: 'Pendente',
};

const STATUS_STYLE: Record<TenantStatus, string> = {
  ACTIVE: 'bg-success-light text-success',
  SUSPENDED: 'bg-error-light text-error',
  PENDING: 'bg-warning-light text-warning',
};

function formatDate(value: Date) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Fortaleza',
  }).format(value);
}

export default async function AdminPage() {
  const { metrics, tenants, auditLogs } = await getAdminDashboardData();
  const cards = [
    { label: 'Total de tenants', value: metrics.totalTenants, icon: Building2 },
    { label: 'Tenants ativos', value: metrics.activeTenants, icon: Activity },
    { label: 'Tenants suspensos', value: metrics.suspendedTenants, icon: Ban },
    { label: 'Total de usuários', value: metrics.totalUsers, icon: Users },
  ];

  return (
    <div className="space-y-8">
      <div>
        <p className="text-brand-500 text-sm font-medium">Plataforma</p>
        <h1 className="text-text-primary text-2xl font-bold">Administração geral</h1>
        <p className="text-text-secondary mt-1 text-sm">
          Visão operacional dos estabelecimentos, usuários e eventos administrativos.
        </p>
      </div>

      <section
        aria-label="Métricas da plataforma"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        {cards.map((card) => (
          <article
            key={card.label}
            className="border-border bg-surface rounded-xl border p-5 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <span className="text-text-secondary text-sm">{card.label}</span>
              <card.icon className="text-brand-500 h-5 w-5" />
            </div>
            <p className="text-text-primary mt-3 text-3xl font-bold">{card.value}</p>
          </article>
        ))}
      </section>

      <section className="border-border bg-surface overflow-hidden rounded-xl border shadow-sm">
        <div className="border-border border-b px-5 py-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-text-primary text-lg font-semibold">Tenants</h2>
              <p className="text-text-secondary text-sm">Até 100 cadastros mais recentes.</p>
            </div>
            <Link
              href="/admin/tenants"
              className="text-brand-500 text-sm font-medium hover:underline"
            >
              Ver todos
            </Link>
          </div>
        </div>
        <div className="overflow-x-auto">
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
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLE[tenant.status]}`}
                    >
                      {STATUS_LABEL[tenant.status]}
                    </span>
                  </td>
                  <td className="text-text-secondary px-5 py-4">{tenant._count.members}</td>
                  <td className="text-text-secondary px-5 py-4">{tenant._count.stores}</td>
                  <td className="text-text-secondary px-5 py-4">{formatDate(tenant.createdAt)}</td>
                  <td className="px-5 py-4">
                    <div className="flex justify-end gap-2">
                      <Link
                        href={`/admin/tenants/${tenant.id}`}
                        className="border-border text-text-secondary hover:bg-surface-secondary inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        Visualizar
                      </Link>
                      {tenant.status === 'ACTIVE' ? (
                        <form action={changeTenantStatusAction.bind(null, tenant.id, 'SUSPENDED')}>
                          <button className="bg-error-light text-error rounded-md px-2.5 py-1.5 text-xs font-medium hover:opacity-80">
                            Suspender
                          </button>
                        </form>
                      ) : (
                        <form action={changeTenantStatusAction.bind(null, tenant.id, 'ACTIVE')}>
                          <button className="bg-success-light text-success rounded-md px-2.5 py-1.5 text-xs font-medium hover:opacity-80">
                            Ativar
                          </button>
                        </form>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {tenants.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-text-muted px-5 py-10 text-center">
                    Nenhum tenant cadastrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <section className="border-border bg-surface overflow-hidden rounded-xl border shadow-sm">
          <div className="border-border border-b px-5 py-4">
            <h2 className="text-text-primary text-lg font-semibold">Logs de auditoria</h2>
            <p className="text-text-secondary text-sm">100 eventos mais recentes.</p>
          </div>
          <div className="max-h-[480px] overflow-auto">
            <ul className="divide-border divide-y">
              {auditLogs.map((log) => (
                <li key={log.id} className="px-5 py-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-text-primary font-medium">{log.action}</span>
                    <time className="text-text-muted text-xs">{formatDate(log.createdAt)}</time>
                  </div>
                  <p className="text-text-secondary mt-1 text-xs">
                    {log.user?.email ?? 'Sistema'} · {log.tenant?.name ?? 'Plataforma'} ·{' '}
                    {log.entity}
                  </p>
                </li>
              ))}
              {auditLogs.length === 0 && (
                <li className="text-text-muted px-5 py-10 text-center text-sm">
                  Nenhum evento registrado.
                </li>
              )}
            </ul>
          </div>
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
              <ShieldCheck className="text-info h-4 w-4" /> Perfis e memberships
            </li>
            <li className="bg-surface-secondary text-text-secondary flex items-center gap-2 rounded-lg p-3">
              <Building2 className="text-info h-4 w-4" /> Lojas vinculadas
            </li>
            <li className="text-text-muted text-xs">
              Abra um tenant em “Visualizar” para consultar os dados.
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}

import type { TenantStatus } from '@prisma/client';
import { ArrowLeft, Building2, Palette, Store, Users } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { changeTenantStatusAction } from '@/features/admin/actions';
import { getAdminTenantDetails } from '@/server/services/admin.service';

const STATUS_LABEL: Record<TenantStatus, string> = {
  ACTIVE: 'Ativo',
  SUSPENDED: 'Suspenso',
  PENDING: 'Pendente',
};

export default async function AdminTenantPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tenant = await getAdminTenantDetails(id);
  if (!tenant) notFound();

  return (
    <div className="space-y-6">
      <Link
        href="/admin/tenants"
        className="text-text-secondary hover:text-brand-500 inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar para tenants
      </Link>

      <section className="border-border bg-surface flex flex-col justify-between gap-4 rounded-xl border p-6 shadow-sm sm:flex-row sm:items-center">
        <div>
          <p className="text-text-muted text-sm">Tenant {tenant.id}</p>
          <h1 className="text-text-primary mt-1 text-2xl font-bold">{tenant.name}</h1>
          <p className="text-text-secondary mt-1 text-sm">
            Status atual: {STATUS_LABEL[tenant.status]}
          </p>
        </div>
        {tenant.status === 'ACTIVE' ? (
          <form action={changeTenantStatusAction.bind(null, tenant.id, 'SUSPENDED')}>
            <button className="bg-error-light text-error rounded-md px-4 py-2 text-sm font-medium hover:opacity-80">
              Suspender tenant
            </button>
          </form>
        ) : (
          <form action={changeTenantStatusAction.bind(null, tenant.id, 'ACTIVE')}>
            <button className="bg-success-light text-success rounded-md px-4 py-2 text-sm font-medium hover:opacity-80">
              Ativar tenant
            </button>
          </form>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="border-border bg-surface rounded-xl border shadow-sm">
          <div className="border-border flex items-center gap-2 border-b px-5 py-4">
            <Users className="text-brand-500 h-5 w-5" />
            <h2 className="text-text-primary font-semibold">Memberships (somente leitura)</h2>
          </div>
          <ul className="divide-border divide-y">
            {tenant.members.map((member) => (
              <li key={member.id} className="px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-text-primary font-medium">{member.user.name}</p>
                    <p className="text-text-secondary text-sm">{member.user.email}</p>
                  </div>
                  <span className="bg-surface-secondary text-text-secondary rounded-full px-2.5 py-1 text-xs">
                    {member.role}
                  </span>
                </div>
                <p className="text-text-muted mt-2 text-xs">
                  Usuário {member.user.isActive ? 'ativo' : 'inativo'} · Membership{' '}
                  {member.isActive ? 'ativa' : 'inativa'}
                </p>
              </li>
            ))}
            {tenant.members.length === 0 && (
              <li className="text-text-muted px-5 py-8 text-center text-sm">Sem memberships.</li>
            )}
          </ul>
        </section>

        <section className="border-border bg-surface rounded-xl border shadow-sm">
          <div className="border-border flex items-center gap-2 border-b px-5 py-4">
            <Store className="text-brand-500 h-5 w-5" />
            <h2 className="text-text-primary font-semibold">Lojas (somente leitura)</h2>
          </div>
          <ul className="divide-border divide-y">
            {tenant.stores.map((store) => (
              <li key={store.id} className="px-5 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-text-primary font-medium">{store.name}</p>
                    <p className="text-text-secondary text-sm">/{store.slug}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-text-muted text-xs">{store.status}</span>
                    <Link
                      href={`/admin/tenants/${tenant.id}/stores/${store.id}/customization`}
                      className="border-border text-text-secondary hover:bg-surface-secondary inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs"
                    >
                      <Palette className="h-3.5 w-3.5" /> Personalização
                    </Link>
                  </div>
                </div>
              </li>
            ))}
            {tenant.stores.length === 0 && (
              <li className="text-text-muted px-5 py-8 text-center text-sm">Sem lojas.</li>
            )}
          </ul>
        </section>
      </div>

      <aside className="border-info/30 bg-info-light text-info flex items-start gap-3 rounded-xl border p-4 text-sm">
        <Building2 className="mt-0.5 h-5 w-5 shrink-0" />
        Esta visão não permite editar usuários, memberships, lojas ou dados comerciais. Somente
        ativar e suspender o tenant gera alteração e auditoria.
      </aside>
    </div>
  );
}

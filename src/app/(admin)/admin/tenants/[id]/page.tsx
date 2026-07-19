import { ArrowLeft, Building2, Palette, Store, Users } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { TenantStatusAction } from '@/components/admin/tenant-status-action';
import { TenantStatusBadge } from '@/components/admin/tenant-status-badge';
import { buttonVariants } from '@/components/ui/button';
import { getAdminTenantDetails } from '@/server/services/admin.service';

export default async function AdminTenantPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tenant = await getAdminTenantDetails(id);
  if (!tenant) notFound();

  return (
    <div className="space-y-6">
      <Link
        href="/admin/tenants"
        className="text-text-secondary hover:text-brand-600 inline-flex min-h-11 items-center gap-1 text-sm"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Voltar para estabelecimentos
      </Link>

      <section className="border-border bg-surface flex flex-col justify-between gap-4 rounded-xl border p-6 shadow-sm sm:flex-row sm:items-center">
        <div>
          <p className="text-text-muted max-w-full text-sm break-all">
            ID do estabelecimento: {tenant.id}
          </p>
          <h1 className="text-text-primary mt-1 text-2xl font-bold text-balance break-words">
            {tenant.name}
          </h1>
          <div className="mt-2">
            <TenantStatusBadge status={tenant.status} />
          </div>
        </div>
        <TenantStatusAction tenantId={tenant.id} tenantName={tenant.name} status={tenant.status} />
      </section>

      <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="border-border bg-surface rounded-xl border shadow-sm">
          <div className="border-border flex items-center gap-2 border-b px-5 py-4">
            <Users className="text-brand-600 h-5 w-5" aria-hidden="true" />
            <h2 className="text-text-primary font-semibold">Acessos da equipe (somente leitura)</h2>
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
                  Usuário {member.user.isActive ? 'ativo' : 'inativo'} · Acesso{' '}
                  {member.isActive ? 'ativo' : 'inativo'}
                </p>
              </li>
            ))}
            {tenant.members.length === 0 && (
              <li className="px-5 py-8 text-center">
                <p className="text-text-primary text-sm font-medium">Nenhum acesso cadastrado</p>
                <p className="text-text-secondary mt-1 text-xs">
                  A equipe deste estabelecimento ainda não possui vínculos.
                </p>
              </li>
            )}
          </ul>
        </section>

        <section className="border-border bg-surface rounded-xl border shadow-sm">
          <div className="border-border flex items-center gap-2 border-b px-5 py-4">
            <Store className="text-brand-600 h-5 w-5" aria-hidden="true" />
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
                      className={buttonVariants({ variant: 'outline', size: 'sm' })}
                    >
                      <Palette aria-hidden="true" /> Personalização
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
        Esta consulta não permite editar usuários, acessos, lojas ou dados comerciais. Somente
        ativar e suspender o estabelecimento gera alteração e auditoria.
      </aside>
    </div>
  );
}

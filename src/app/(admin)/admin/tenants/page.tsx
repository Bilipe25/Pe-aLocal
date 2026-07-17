import type { TenantStatus } from '@prisma/client';
import { Eye } from 'lucide-react';
import Link from 'next/link';

import { getAdminTenantsData } from '@/server/services/admin.service';

const STATUS_LABEL: Record<TenantStatus, string> = {
  ACTIVE: 'Ativo',
  SUSPENDED: 'Suspenso',
  PENDING: 'Pendente',
};

export const metadata = { title: 'Tenants' };

export default async function AdminTenantsPage() {
  const { total, tenants } = await getAdminTenantsData();

  return (
    <div className="space-y-6">
      <header>
        <p className="text-brand-500 text-sm font-medium">Administração geral</p>
        <h1 className="text-text-primary text-2xl font-bold">Tenants</h1>
        <p className="text-text-secondary mt-1 text-sm">
          Selecione um estabelecimento e depois uma loja para administrar sua personalização.
        </p>
      </header>

      <section className="border-border bg-surface overflow-hidden rounded-xl border shadow-sm">
        <div className="border-border border-b px-5 py-4">
          <h2 className="text-text-primary font-semibold">{total} tenants cadastrados</h2>
          <p className="text-text-secondary text-sm">Exibindo até 100 cadastros mais recentes.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="bg-surface-secondary text-text-secondary">
              <tr>
                <th className="px-5 py-3 font-medium">Estabelecimento</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Usuários</th>
                <th className="px-5 py-3 font-medium">Lojas</th>
                <th className="px-5 py-3 text-right font-medium">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {tenants.map((tenant) => (
                <tr key={tenant.id}>
                  <td className="text-text-primary px-5 py-4 font-medium">{tenant.name}</td>
                  <td className="text-text-secondary px-5 py-4">{STATUS_LABEL[tenant.status]}</td>
                  <td className="text-text-secondary px-5 py-4">{tenant._count.members}</td>
                  <td className="text-text-secondary px-5 py-4">{tenant._count.stores}</td>
                  <td className="px-5 py-4 text-right">
                    <Link
                      href={`/admin/tenants/${tenant.id}`}
                      className="border-border text-text-secondary hover:bg-surface-secondary inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs"
                    >
                      <Eye className="h-3.5 w-3.5" /> Visualizar
                    </Link>
                  </td>
                </tr>
              ))}
              {tenants.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-text-muted px-5 py-10 text-center">
                    Nenhum tenant cadastrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

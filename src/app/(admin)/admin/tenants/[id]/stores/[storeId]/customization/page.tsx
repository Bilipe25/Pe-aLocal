import { ArrowLeft, ExternalLink, Palette } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { TenantAccessError } from '@/server/errors';
import { getAdminStoreContext } from '@/server/services/admin.service';

export const metadata = { title: 'Personalização da loja' };

export default async function AdminStoreCustomizationPage({
  params,
}: {
  params: Promise<{ id: string; storeId: string }>;
}) {
  const { id: tenantId, storeId } = await params;

  let store;
  try {
    store = await getAdminStoreContext(tenantId, storeId);
  } catch (error) {
    if (error instanceof TenantAccessError) notFound();
    throw error;
  }

  return (
    <div className="space-y-6">
      <Link
        href={`/admin/tenants/${tenantId}`}
        className="text-text-secondary hover:text-brand-500 inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar para {store.tenant.name}
      </Link>

      <header className="border-border bg-surface rounded-xl border p-6 shadow-sm">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <p className="text-brand-500 text-sm font-medium">Personalização por loja</p>
            <h1 className="text-text-primary mt-1 text-2xl font-bold">{store.name}</h1>
            <p className="text-text-secondary mt-1 text-sm">
              /{store.slug} · {store.status} · {store.isActive ? 'ativa' : 'inativa'}
            </p>
          </div>
          <Link
            href={`/${store.slug}`}
            target="_blank"
            rel="noreferrer"
            className="border-border text-text-secondary hover:bg-surface-secondary inline-flex items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-sm"
          >
            Visualizar cardápio <ExternalLink className="h-4 w-4" />
          </Link>
        </div>
      </header>

      <section className="border-info/30 bg-info-light text-info rounded-xl border p-6">
        <Palette className="h-6 w-6" />
        <h2 className="mt-3 text-lg font-semibold">Acesso seguro configurado</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6">
          Esta rota já exige SUPER_ADMIN e confirma no servidor que a loja pertence ao tenant da
          URL. O editor de rascunho, publicação e histórico será adicionado na próxima fase.
        </p>
      </section>
    </div>
  );
}

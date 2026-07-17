import { ArrowLeft, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { TenantAccessError } from '@/server/errors';
import { CustomizationEditor } from '@/components/admin/customization-editor';
import { getAdminCustomizationData } from '@/server/services/store-customization.service';

export const metadata = { title: 'Personalização da loja' };

export default async function AdminStoreCustomizationPage({
  params,
}: {
  params: Promise<{ id: string; storeId: string }>;
}) {
  const { id: tenantId, storeId } = await params;

  let data;
  try {
    data = await getAdminCustomizationData(tenantId, storeId);
  } catch (error) {
    if (error instanceof TenantAccessError) notFound();
    throw error;
  }

  const {
    store,
    customization,
    revisions,
    assets,
    banners,
    domains,
    entitlement,
    destinations,
  } = data;

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

      <CustomizationEditor
        key={`${customization.draftVersion}-${customization.publishedVersion}`}
        tenantId={tenantId}
        storeId={storeId}
        storeSlug={store.slug}
        initialConfig={customization.effectiveConfig}
        initialPublishedConfig={customization.publishedConfig}
        initialDraftVersion={customization.draftVersion}
        initialPublishedVersion={customization.publishedVersion}
        initialHasDraft={customization.hasDraft}
        publishedAt={customization.publishedAt?.toISOString() ?? null}
        revisions={revisions.map((revision) => ({
          id: revision.id,
          version: revision.version,
          reason: revision.reason,
          origin: revision.origin,
          publishedAt: revision.publishedAt.toISOString(),
          actor: revision.actor ? { name: revision.actor.name, email: revision.actor.email } : null,
        }))}
        initialAssets={assets.map((asset) => ({
          ...asset,
          createdAt: asset.createdAt.toISOString(),
          deletedAt: asset.deletedAt?.toISOString() ?? null,
        }))}
        initialBanners={banners.map((banner) => ({
          ...banner,
          startsAt: banner.startsAt?.toISOString() ?? null,
          endsAt: banner.endsAt?.toISOString() ?? null,
          createdAt: banner.createdAt.toISOString(),
          updatedAt: banner.updatedAt.toISOString(),
        }))}
        initialDomains={domains.map((domain) => ({
          ...domain,
          verifiedAt: domain.verifiedAt?.toISOString() ?? null,
          createdAt: domain.createdAt.toISOString(),
          updatedAt: domain.updatedAt.toISOString(),
        }))}
        initialEntitlement={entitlement}
        destinations={destinations}
      />
    </div>
  );
}

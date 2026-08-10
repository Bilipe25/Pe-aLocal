'use client';

import { AlertTriangle, CheckCircle2, Smartphone } from 'lucide-react';

import type { AdminStoreAssetItem } from '@/components/admin/store-assets-manager';
import { storePwaIconUrl } from '@/features/assets/urls';
import type { StoreCustomizationConfig } from '@/schemas/customization';

function isInstallableSource(asset: AdminStoreAssetItem | undefined) {
  if (!asset) return false;
  const ratio = asset.width / asset.height;
  return Math.min(asset.width, asset.height) >= 192 && ratio >= 0.9 && ratio <= 1.1;
}

export function InstallableAppPreview({
  config,
  assets,
  storeName,
  storeSlug,
}: {
  config: StoreCustomizationConfig;
  assets: AdminStoreAssetItem[];
  storeName: string;
  storeSlug: string;
}) {
  const favicon = assets.find(
    (asset) => asset.id === config.identity.faviconAssetId && asset.assetType === 'FAVICON',
  );
  const logo = assets.find(
    (asset) => asset.id === config.identity.logoAssetId && asset.assetType === 'LOGO',
  );
  const source = [favicon, logo].find(isInstallableSource);
  const iconUrl = source
    ? storePwaIconUrl(source.id, 'any-192')
    : '/pwa/pedidolocal-icon-v1-192.png';
  const sourceLabel = source
    ? source.id === favicon?.id
      ? 'Favicon da loja'
      : 'Logo da loja'
    : 'Ícone PedidoLocal de contingência';

  return (
    <section className="border-border bg-surface rounded-xl border p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Smartphone className="text-brand-600 h-5 w-5" aria-hidden="true" />
            <h2 className="text-text-primary font-semibold">Aplicativo instalável</h2>
          </div>
          <p className="text-text-secondary mt-1 text-xs">Prévia baseada no rascunho atual.</p>
        </div>
        {source ? (
          <CheckCircle2 className="text-success h-5 w-5 shrink-0" aria-label="Ícone válido" />
        ) : (
          <AlertTriangle className="text-warning h-5 w-5 shrink-0" aria-label="Usando fallback" />
        )}
      </div>

      <div className="mt-5 flex items-center gap-4">
        <div
          className="border-border flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border"
          style={{ backgroundColor: config.palette.background }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={iconUrl} alt="" className="h-full w-full object-cover" />
        </div>
        <div className="min-w-0">
          <p className="text-text-primary truncate font-semibold">{storeName}</p>
          <p className="text-text-secondary mt-1 truncate text-xs">/{storeSlug}</p>
          <span
            className="mt-2 inline-block h-2.5 w-16 rounded-full"
            style={{ backgroundColor: config.palette.primary }}
            aria-label={`Cor do tema ${config.palette.primary}`}
          />
        </div>
      </div>

      <dl className="border-border mt-5 grid gap-2 border-t pt-4 text-xs">
        <div className="flex justify-between gap-3">
          <dt className="text-text-muted">Nome</dt>
          <dd className="text-text-primary min-w-0 truncate font-medium">{storeName}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-text-muted">Início</dt>
          <dd className="text-text-primary font-mono">/{storeSlug}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-text-muted">Fonte do ícone</dt>
          <dd className="text-text-primary text-right font-medium">{sourceLabel}</dd>
        </div>
      </dl>

      {!source && (
        <p role="alert" className="bg-warning-light text-warning mt-4 rounded-lg p-3 text-xs">
          Publique um favicon ou logo aproximadamente quadrado, com pelo menos 192×192 px. Para
          melhor nitidez, envie 512×512 px.
        </p>
      )}
    </section>
  );
}

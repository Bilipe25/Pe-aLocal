'use client';

import { ImageIcon, Trash2, Upload } from 'lucide-react';
import { useMemo, useState, useTransition } from 'react';

import { uploadAdminStoreAsset } from '@/components/admin/store-asset-upload';
import { deleteStoreAssetAction } from '@/features/assets/actions';
import type { StoreCustomizationConfig } from '@/schemas/customization';
import type { StoreAssetTypeValue } from '@/schemas/store-asset';
import { ChangeScopeBadge } from '@/components/admin/change-scope-badge';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

type IdentityAssetField =
  'logoAssetId' | 'logoDarkAssetId' | 'coverAssetId' | 'faviconAssetId' | 'socialImageAssetId';

export interface AdminStoreAssetItem {
  id: string;
  assetType: StoreAssetTypeValue;
  mimeType: string;
  width: number;
  height: number;
  sizeBytes: number;
  altText: string;
  url: string;
  previewUrl: string;
  createdAt: string;
  deletedAt: string | null;
}

const ASSET_OPTIONS: {
  type: StoreAssetTypeValue;
  field: IdentityAssetField | null;
  label: string;
  hint: string;
  usageLabel?: string;
}[] = [
  { type: 'LOGO', field: 'logoAssetId', label: 'Logo', hint: 'PNG, JPEG, WebP ou AVIF · até 2 MB' },
  {
    type: 'LOGO_DARK',
    field: 'logoDarkAssetId',
    label: 'Logo escuro',
    hint: 'Versão para fundos claros · até 2 MB',
  },
  { type: 'COVER', field: 'coverAssetId', label: 'Capa', hint: 'Mínimo 600×180 · até 5 MB' },
  {
    type: 'FAVICON',
    field: 'faviconAssetId',
    label: 'Favicon',
    hint: 'Mínimo 192×192 · recomendado 512×512 · aproximadamente quadrado · até 512 KB',
  },
  {
    type: 'SOCIAL_IMAGE',
    field: 'socialImageAssetId',
    label: 'Compartilhamento',
    hint: 'Mínimo 300×200 · até 3 MB',
  },
  {
    type: 'BANNER',
    field: null,
    label: 'Banner',
    hint: 'Mínimo 600×180 · até 5 MB',
    usageLabel: 'Disponível para banners',
  },
  {
    type: 'CATEGORY_IMAGE',
    field: null,
    label: 'Imagem de categoria',
    hint: 'Sugerido 800×800 · mínimo 320×320 · até 2 MB',
    usageLabel: 'Disponível para categorias',
  },
];

export function StoreAssetsManager({
  tenantId,
  storeId,
  identity,
  assets,
  onAssign,
  onAssetUploaded,
  onAssetDeleted,
}: {
  tenantId: string;
  storeId: string;
  identity: StoreCustomizationConfig['identity'];
  assets: AdminStoreAssetItem[];
  onAssign: (field: IdentityAssetField, assetId: string | null) => void;
  onAssetUploaded: (asset: AdminStoreAssetItem) => void;
  onAssetDeleted: (assetId: string) => void;
}) {
  const [selectedType, setSelectedType] = useState<StoreAssetTypeValue>('LOGO');
  const [file, setFile] = useState<File | null>(null);
  const [altText, setAltText] = useState('');
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; message: string } | null>(
    null,
  );
  const [isPending, startTransition] = useTransition();
  const option = ASSET_OPTIONS.find((item) => item.type === selectedType)!;
  const currentAssetId = option.field ? identity[option.field] : null;
  const grouped = useMemo(
    () =>
      ASSET_OPTIONS.map((item) => ({
        ...item,
        assets: assets.filter((asset) => asset.assetType === item.type),
      })),
    [assets],
  );

  async function uploadAsset() {
    if (!file) {
      setFeedback({ tone: 'error', message: 'Selecione uma imagem.' });
      return;
    }
    setFeedback(null);
    try {
      const uploaded = await uploadAdminStoreAsset({
        tenantId,
        storeId,
        file,
        assetType: selectedType,
        altText,
        replaceAssetId: currentAssetId,
      });
      onAssetUploaded(uploaded);
      if (option.field) onAssign(option.field, uploaded.id);
      setFile(null);
      setAltText('');
      setFeedback({
        tone: 'success',
        message: option.field
          ? 'Upload concluído. Salve o rascunho para associar a imagem.'
          : `Upload concluído. ${option.usageLabel ?? 'O asset está disponível.'}`,
      });
    } catch (error) {
      setFeedback({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Não foi possível enviar a imagem.',
      });
    }
  }

  async function removeAsset(asset: AdminStoreAssetItem) {
    return new Promise<boolean>((resolve) =>
      startTransition(async () => {
        const result = await deleteStoreAssetAction(tenantId, storeId, asset.id);
        if (!result.success) {
          setFeedback({ tone: 'error', message: result.error.message });
          resolve(false);
          return;
        }
        onAssetDeleted(asset.id);
        setFeedback({ tone: 'success', message: 'Asset marcado para exclusão segura.' });
        resolve(true);
      }),
    );
  }

  return (
    <section className="border-border bg-surface min-w-0 rounded-xl border p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <ImageIcon className="text-brand-600 h-5 w-5" aria-hidden="true" />
        <h3 className="text-text-primary text-lg font-semibold">Imagens da marca</h3>
      </div>
      <div className="mt-3">
        <ChangeScopeBadge scope="draft" />
      </div>
      <p className="text-text-secondary mt-1 text-sm">
        O upload não publica sozinho: associe a imagem, salve o rascunho e publique explicitamente.
      </p>

      <div className="border-border mt-5 grid grid-cols-1 gap-4 rounded-lg border p-4 sm:grid-cols-2">
        <label className="text-text-secondary grid min-w-0 gap-1.5 text-sm">
          Tipo
          <select
            value={selectedType}
            onChange={(event) => setSelectedType(event.target.value as StoreAssetTypeValue)}
            className="border-border bg-surface text-text-primary min-h-11 w-full min-w-0 rounded-md border px-3 py-2"
          >
            {ASSET_OPTIONS.map((item) => (
              <option key={item.type} value={item.type}>
                {item.label}
              </option>
            ))}
          </select>
          <span className="text-text-muted text-xs">{option.hint}</span>
        </label>
        <label className="text-text-secondary grid min-w-0 gap-1.5 text-sm">
          Arquivo
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/avif"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            className="border-border min-h-11 w-full max-w-full min-w-0 rounded-md border px-3 py-2 text-sm"
          />
        </label>
        <label className="text-text-secondary grid min-w-0 gap-1.5 text-sm sm:col-span-2">
          Texto alternativo {selectedType === 'FAVICON' ? '(opcional)' : ''}
          <input
            value={altText}
            maxLength={300}
            onChange={(event) => setAltText(event.target.value)}
            className="border-border bg-surface text-text-primary min-h-11 w-full min-w-0 rounded-md border px-3 py-2"
          />
        </label>
        <button
          type="button"
          disabled={isPending || !file}
          onClick={() => startTransition(uploadAsset)}
          className="bg-brand-600 hover:bg-brand-700 inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50 sm:col-span-2"
        >
          <Upload className="h-4 w-4" /> Enviar e usar no rascunho
        </button>
      </div>

      {feedback && (
        <p
          role={feedback.tone === 'error' ? 'alert' : 'status'}
          className={`${feedback.tone === 'error' ? 'bg-error-light text-error' : 'bg-info-light text-info'} mt-4 rounded-lg p-3 text-sm`}
        >
          {feedback.message}
        </p>
      )}

      <div className="mt-5 space-y-5">
        {grouped.map((group) => (
          <div key={group.type}>
            <h3 className="text-text-primary text-sm font-semibold">{group.label}</h3>
            <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {group.assets.map((asset) => {
                const selected = group.field ? identity[group.field] === asset.id : false;
                return (
                  <article
                    key={asset.id}
                    className={`overflow-hidden rounded-lg border ${selected ? 'border-brand-500' : 'border-border'}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={asset.previewUrl}
                      alt={asset.altText}
                      className="bg-surface-secondary h-28 w-full object-contain"
                      loading="lazy"
                    />
                    <div className="space-y-2 p-3">
                      <p className="text-text-muted text-xs">
                        {asset.width}×{asset.height} · {Math.ceil(asset.sizeBytes / 1024)} KB
                      </p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => group.field && onAssign(group.field, asset.id)}
                          disabled={!group.field}
                          className="border-border flex-1 rounded-md border px-2 py-1.5 text-xs"
                        >
                          {group.field ? (selected ? 'Em uso' : 'Usar') : group.usageLabel}
                        </button>
                        <ConfirmDialog
                          title={`Excluir ${group.label.toLowerCase()}?`}
                          description="Referências publicadas ou históricas impedirão a exclusão. A tentativa será auditada."
                          confirmLabel="Excluir asset"
                          destructive
                          onConfirm={() => removeAsset(asset)}
                          trigger={
                            <button
                              type="button"
                              disabled={isPending}
                              aria-label={`Excluir ${group.label}`}
                              className="text-error border-border inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border p-2 disabled:opacity-50"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          }
                        />
                      </div>
                    </div>
                  </article>
                );
              })}
              {group.assets.length === 0 && (
                <p className="text-text-muted text-xs">Nenhum arquivo enviado.</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

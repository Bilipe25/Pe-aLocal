'use client';

import { ImagePlus, Search, Trash2, Upload } from 'lucide-react';
import { useMemo, useState, useTransition } from 'react';

import { uploadAdminStoreAsset } from '@/components/admin/store-asset-upload';
import type { AdminStoreAssetItem } from '@/components/admin/store-assets-manager';
import type { StoreCustomizationConfig } from '@/schemas/customization';

export interface AdminStoreCategoryItem {
  id: string;
  name: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
}

interface CategoryImageRowProps {
  tenantId: string;
  storeId: string;
  category: AdminStoreCategoryItem;
  assets: AdminStoreAssetItem[];
  selectedAssetId: string | null;
  onAssociate: (assetId: string | null) => void;
  onAssetUploaded: (asset: AdminStoreAssetItem) => void;
}

function CategoryImageRow({
  tenantId,
  storeId,
  category,
  assets,
  selectedAssetId,
  onAssociate,
  onAssetUploaded,
}: CategoryImageRowProps) {
  const [file, setFile] = useState<File | null>(null);
  const [altText, setAltText] = useState(`Imagem representando a categoria ${category.name}`);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const selectedAsset = assets.find((asset) => asset.id === selectedAssetId) ?? null;
  const inputId = `category-image-${category.id}`;

  function removeAssociation() {
    if (!window.confirm(`Remover a imagem associada à categoria ${category.name}?`)) return;
    onAssociate(null);
    setFeedback('Associação removida do rascunho em memória.');
  }

  async function upload() {
    if (!file) {
      setFeedback('Selecione uma imagem.');
      return;
    }
    try {
      const asset = await uploadAdminStoreAsset({
        tenantId,
        storeId,
        file,
        assetType: 'CATEGORY_IMAGE',
        altText,
      });
      onAssetUploaded(asset);
      onAssociate(asset.id);
      setFile(null);
      setFeedback(
        'Imagem enviada e associada ao rascunho. Salve e publique para exibi-la no cardápio.',
      );
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Não foi possível enviar a imagem.');
    }
  }

  return (
    <article className="border-border grid gap-4 rounded-lg border p-4 md:grid-cols-[8rem_minmax(0,1fr)]">
      <div className="bg-surface-secondary flex aspect-square items-center justify-center overflow-hidden rounded-lg">
        {selectedAsset ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={selectedAsset.previewUrl}
            alt={selectedAsset.altText}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="text-text-muted grid justify-items-center gap-1 text-center text-xs">
            <ImagePlus className="h-6 w-6" aria-hidden="true" />
            Sem imagem
          </div>
        )}
      </div>

      <div className="min-w-0 space-y-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-text-primary font-semibold">{category.name}</h3>
            {!category.isActive && (
              <span className="bg-warning-light text-warning rounded-full px-2 py-0.5 text-xs">
                Inativa
              </span>
            )}
          </div>
          <p className="text-text-secondary mt-1 text-sm">
            {category.description || 'Sem descrição.'}
          </p>
        </div>

        <label className="text-text-secondary grid gap-1.5 text-sm">
          Selecionar imagem existente
          <select
            value={selectedAssetId ?? ''}
            onChange={(event) => onAssociate(event.target.value || null)}
            className="border-border bg-surface text-text-primary min-w-0 rounded-md border px-3 py-2"
          >
            <option value="">Sem imagem</option>
            {assets.map((asset) => (
              <option key={asset.id} value={asset.id}>
                {asset.altText} · {asset.width}×{asset.height}
              </option>
            ))}
          </select>
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label htmlFor={inputId} className="text-text-secondary grid gap-1.5 text-sm">
            Enviar nova imagem
            <input
              id={inputId}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/avif"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              className="border-border min-w-0 rounded-md border px-3 py-2 text-sm"
            />
          </label>
          <label className="text-text-secondary grid gap-1.5 text-sm">
            Texto alternativo
            <input
              value={altText}
              maxLength={300}
              onChange={(event) => setAltText(event.target.value)}
              className="border-border bg-surface text-text-primary min-w-0 rounded-md border px-3 py-2"
            />
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={isPending || !file}
            onClick={() => startTransition(upload)}
            className="bg-brand-500 inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            <Upload className="h-4 w-4" /> Enviar e associar
          </button>
          <button
            type="button"
            disabled={isPending || !selectedAssetId}
            onClick={removeAssociation}
            className="border-border text-error inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" /> Remover associação
          </button>
        </div>
        {feedback && <p role="status" className="bg-info-light text-info rounded-md p-2 text-xs">{feedback}</p>}
      </div>
    </article>
  );
}

export function StoreCategoryImagesManager({
  tenantId,
  storeId,
  categories,
  assets,
  showImages,
  associations,
  onShowImagesChange,
  onAssociationsChange,
  onAssetUploaded,
}: {
  tenantId: string;
  storeId: string;
  categories: AdminStoreCategoryItem[];
  assets: AdminStoreAssetItem[];
  showImages: boolean;
  associations: StoreCustomizationConfig['categoryImages'];
  onShowImagesChange: (show: boolean) => void;
  onAssociationsChange: (items: StoreCustomizationConfig['categoryImages']) => void;
  onAssetUploaded: (asset: AdminStoreAssetItem) => void;
}) {
  const [search, setSearch] = useState('');
  const categoryAssets = useMemo(
    () => assets.filter((asset) => asset.assetType === 'CATEGORY_IMAGE'),
    [assets],
  );
  const associationByCategoryId = useMemo(
    () => new Map(associations.map((item) => [item.categoryId, item.assetId])),
    [associations],
  );
  const categoryIds = useMemo(() => new Set(categories.map((category) => category.id)), [categories]);
  const orphanAssociations = associations.filter((item) => !categoryIds.has(item.categoryId));
  const visibleCategories = categories.filter((category) =>
    `${category.name} ${category.description ?? ''}`
      .toLocaleLowerCase('pt-BR')
      .includes(search.trim().toLocaleLowerCase('pt-BR')),
  );

  function associate(categoryId: string, assetId: string | null) {
    const remaining = associations.filter((item) => item.categoryId !== categoryId);
    onAssociationsChange(assetId ? [...remaining, { categoryId, assetId }] : remaining);
  }

  return (
    <section className="border-border bg-surface rounded-xl border p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <ImagePlus className="text-brand-500 h-5 w-5" />
        <h2 className="text-text-primary text-lg font-semibold">5. Imagens das categorias</h2>
      </div>
      <p className="text-text-secondary mt-1 text-sm">
        As associações ficam no rascunho até serem salvas e publicadas explicitamente.
      </p>

      <label className="border-border mt-5 flex items-center gap-3 rounded-lg border p-4 text-sm">
        <input
          type="checkbox"
          checked={showImages}
          onChange={(event) => onShowImagesChange(event.target.checked)}
        />
        <span className="text-text-primary font-medium">
          Exibir imagens das categorias no cardápio
        </span>
      </label>

      {categories.length > 6 && (
        <label className="text-text-secondary relative mt-4 block text-sm">
          <span className="sr-only">Buscar categorias</span>
          <Search className="text-text-muted pointer-events-none absolute top-2.5 left-3 h-4 w-4" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar categorias"
            className="border-border bg-surface text-text-primary w-full rounded-md border py-2 pr-3 pl-9"
          />
        </label>
      )}

      <div className="mt-4 space-y-4">
        {visibleCategories.map((category) => (
          <CategoryImageRow
            key={category.id}
            tenantId={tenantId}
            storeId={storeId}
            category={category}
            assets={categoryAssets}
            selectedAssetId={associationByCategoryId.get(category.id) ?? null}
            onAssociate={(assetId) => associate(category.id, assetId)}
            onAssetUploaded={onAssetUploaded}
          />
        ))}
        {visibleCategories.length === 0 && (
          <p className="text-text-muted py-6 text-center text-sm">Nenhuma categoria encontrada.</p>
        )}
      </div>

      {orphanAssociations.length > 0 && (
        <div className="border-warning bg-warning-light mt-5 rounded-lg border p-4">
          <h3 className="text-warning text-sm font-semibold">Associações órfãs</h3>
          <p className="text-warning mt-1 text-xs">
            Estas categorias foram removidas. O cardápio público ignora as associações.
          </p>
          <ul className="mt-3 space-y-2">
            {orphanAssociations.map((association) => (
              <li key={association.categoryId} className="flex items-center justify-between gap-3 text-xs">
                <span className="text-warning">Categoria removida</span>
                <button
                  type="button"
                  onClick={() => associate(association.categoryId, null)}
                  className="border-warning text-warning rounded-md border px-2 py-1"
                >
                  Limpar associação
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

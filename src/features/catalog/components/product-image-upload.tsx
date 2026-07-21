'use client';

import { useRef, useState } from 'react';
import Image from 'next/image';
import { ImagePlus, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { setProductImageAction } from '@/features/catalog/actions';
import { uploadAdminStoreAsset } from '@/components/admin/store-asset-upload';

interface ProductImageUploadProps {
  productId: string;
  tenantId: string;
  storeId: string;
  currentImageUrl?: string | null;
  currentAssetId?: string | null;
}

const MAX_MB = 3;
const ACCEPT = 'image/png,image/jpeg,image/webp,image/avif';

export function ProductImageUpload({
  productId,
  tenantId,
  storeId,
  currentImageUrl,
  currentAssetId,
}: ProductImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(currentImageUrl ?? null);
  const [assetId, setAssetId] = useState<string | null>(currentAssetId ?? null);
  const [uploading, setUploading] = useState(false);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validação client-side rápida antes de enviar
    if (file.size > MAX_MB * 1024 * 1024) {
      toast.error(`A imagem deve ter no máximo ${MAX_MB} MB.`);
      return;
    }
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/avif'].includes(file.type)) {
      toast.error('Use PNG, JPEG, WebP ou AVIF.');
      return;
    }

    // Preview local imediato
    const localUrl = URL.createObjectURL(file);
    setPreview(localUrl);
    setUploading(true);

    try {
      // 1. Upload para R2 via API de assets
      const uploaded = await uploadAdminStoreAsset({
        tenantId,
        storeId,
        file,
        assetType: 'PRODUCT_IMAGE',
        altText: `Imagem do produto`,
        replaceAssetId: assetId ?? undefined,
      });

      // 2. Associa o asset ao produto (passa URL pública do upload)
      const result = await setProductImageAction(productId, uploaded.id, uploaded.url);
      if (!result.success) {
        toast.error(result.error.message);
        setPreview(currentImageUrl ?? null); // reverte preview
        return;
      }

      setAssetId(uploaded.id);
      setPreview(uploaded.url);
      toast.success('Imagem do produto atualizada!');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao enviar imagem.');
      setPreview(currentImageUrl ?? null);
    } finally {
      setUploading(false);
      // Reset o input para permitir re-upload do mesmo arquivo
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function handleRemove(): Promise<boolean> {
    const result = await setProductImageAction(productId, null);
    if (result.success) {
      setPreview(null);
      setAssetId(null);
      toast.success('Imagem removida.');
      return true;
    } else {
      toast.error(result.error.message);
      return false;
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-text-primary text-sm font-medium">Foto do produto</p>

      {/* Área de preview / upload */}
      <div className="relative">
        {preview ? (
          <div className="group relative h-48 w-full overflow-hidden rounded-xl border border-border">
            <Image
              src={preview}
              alt="Foto do produto"
              fill
              className="object-cover"
              unoptimized={preview.startsWith('blob:')}
              sizes="(max-width: 768px) 100vw, 640px"
            />
            {uploading && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                <Loader2 className="h-8 w-8 animate-spin text-white" />
              </div>
            )}
            {/* Overlay de ações no hover */}
            {!uploading && (
              <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/0 opacity-0 transition-all group-hover:bg-black/40 group-hover:opacity-100">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => inputRef.current?.click()}
                >
                  <ImagePlus className="h-4 w-4" />
                  Trocar
                </Button>
                <ConfirmDialog
                  title="Remover foto do produto?"
                  description="A imagem será desvinculada do produto. Esta ação pode ser desfeita fazendo upload novamente."
                  confirmLabel="Remover"
                  destructive
                  onConfirm={handleRemove}
                  trigger={
                    <Button type="button" size="sm" variant="destructive">
                      <Trash2 className="h-4 w-4" />
                      Remover
                    </Button>
                  }
                />
              </div>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="border-border text-text-secondary hover:bg-surface-secondary hover:border-brand-400 hover:text-brand-600 flex h-48 w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          >
            {uploading ? (
              <Loader2 className="h-8 w-8 animate-spin" />
            ) : (
              <>
                <ImagePlus className="h-8 w-8" />
                <span className="text-sm font-medium">Adicionar foto do produto</span>
                <span className="text-xs">PNG, JPEG, WebP ou AVIF — até {MAX_MB} MB</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Input oculto */}
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        aria-label="Selecionar imagem do produto"
        onChange={handleFileChange}
      />
    </div>
  );
}

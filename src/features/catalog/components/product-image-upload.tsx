'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ImagePlus, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { removeProductImageAction } from '@/features/catalog/actions';
import { tenantStoreAssetUrl } from '@/features/assets/urls';

interface ProductImageUploadProps {
  productId: string;
  productName: string;
  currentImageUrl?: string | null;
}

const MAX_MB = 3;
const ACCEPT = 'image/png,image/jpeg,image/webp,image/avif';

export function ProductImageUpload({
  productId,
  productName,
  currentImageUrl,
}: ProductImageUploadProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const localPreviewRef = useRef<string | null>(null);
  const uploadInFlightRef = useRef(false);
  const [preview, setPreview] = useState<string | null>(currentImageUrl ?? null);
  const [uploading, setUploading] = useState(false);
  const [imageLoadFailed, setImageLoadFailed] = useState(false);

  useEffect(
    () => () => {
      if (localPreviewRef.current) URL.revokeObjectURL(localPreviewRef.current);
    },
    [],
  );

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (uploadInFlightRef.current) {
      e.target.value = '';
      return;
    }

    // Validação client-side rápida antes de enviar
    if (file.size > MAX_MB * 1024 * 1024) {
      toast.error(`A imagem deve ter no máximo ${MAX_MB} MB.`);
      e.target.value = '';
      return;
    }
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/avif'].includes(file.type)) {
      toast.error('Use PNG, JPEG, WebP ou AVIF.');
      e.target.value = '';
      return;
    }

    // Preview local imediato
    const previousPreview = preview;
    const localUrl = URL.createObjectURL(file);
    if (localPreviewRef.current) URL.revokeObjectURL(localPreviewRef.current);
    localPreviewRef.current = localUrl;
    uploadInFlightRef.current = true;
    setPreview(localUrl);
    setImageLoadFailed(false);
    setUploading(true);

    try {
      // 1. Upload para R2 via rota de tenant (aceita OWNER/MANAGER)
      const formPayload = new FormData();
      formPayload.set('file', file);
      formPayload.set('productId', productId);
      formPayload.set('altText', `Imagem de ${productName}`);

      const uploadRes = await fetch('/api/tenant/assets', {
        method: 'POST',
        body: formPayload,
      });
      const responseText = await uploadRes.text();
      let uploadBody: { asset?: { id: string; url?: string }; message?: string } = {};
      try {
        uploadBody = responseText ? JSON.parse(responseText) : {};
      } catch {
        throw new Error(`O servidor não concluiu o upload (HTTP ${uploadRes.status}).`);
      }
      if (!uploadRes.ok || !uploadBody.asset) {
        throw new Error(uploadBody.message ?? 'Não foi possível enviar a imagem.');
      }
      const uploaded = uploadBody.asset;

      setPreview(uploaded.url ?? tenantStoreAssetUrl(uploaded.id, 768));
      toast.success('Imagem do produto atualizada!');
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao enviar imagem.');
      setPreview(previousPreview);
    } finally {
      URL.revokeObjectURL(localUrl);
      if (localPreviewRef.current === localUrl) localPreviewRef.current = null;
      uploadInFlightRef.current = false;
      setUploading(false);
      // Reset o input para permitir re-upload do mesmo arquivo
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function handleRemove(): Promise<boolean> {
    const result = await removeProductImageAction(productId);
    if (result.success) {
      setPreview(null);
      setImageLoadFailed(false);
      toast.success('Imagem removida.');
      router.refresh();
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
        {preview && !imageLoadFailed ? (
          <div className="group border-border bg-surface-secondary relative h-48 w-full overflow-hidden rounded-xl border">
            {/* A prévia autenticada deve ser carregada diretamente pelo navegador. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview}
              alt={`Imagem de ${productName}`}
              className="h-full w-full object-cover"
              onError={() => !uploading && setImageLoadFailed(true)}
            />
            {uploading && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                <Loader2 className="h-8 w-8 animate-spin text-white" />
              </div>
            )}
            {!uploading && (
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-end gap-2 bg-gradient-to-t from-black/70 to-transparent p-3 pt-10 opacity-100 transition-opacity sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
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
                <span className="text-sm font-medium">
                  {imageLoadFailed
                    ? 'Imagem indisponível — enviar novamente'
                    : 'Adicionar foto do produto'}
                </span>
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
        disabled={uploading}
        className="hidden"
        aria-label="Selecionar imagem do produto"
        onChange={handleFileChange}
      />
    </div>
  );
}

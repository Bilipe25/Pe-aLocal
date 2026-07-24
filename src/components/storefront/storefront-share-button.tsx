'use client';

import { Share2 } from 'lucide-react';
import { toast } from 'sonner';

interface StorefrontShareButtonProps {
  storeName: string;
  shareUrl?: string;
}

async function copyToClipboard(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  textarea.remove();

  if (!copied) throw new Error('Clipboard indisponível');
}

export function StorefrontShareButton({ storeName, shareUrl }: StorefrontShareButtonProps) {
  async function handleShare() {
    const url = shareUrl || window.location.href;

    if (navigator.share) {
      try {
        await navigator.share({
          title: storeName,
          text: `Confira o cardápio de ${storeName}`,
          url,
        });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        toast.error('Não foi possível compartilhar o cardápio.');
        return;
      }
    }

    try {
      await copyToClipboard(url);
      toast.success('Link do cardápio copiado.');
    } catch {
      toast.error('Não foi possível copiar o link do cardápio.');
    }
  }

  return (
    <button
      type="button"
      onClick={handleShare}
      className="storefront-hero-share"
      aria-label={`Compartilhar cardápio de ${storeName}`}
    >
      <Share2 aria-hidden="true" />
    </button>
  );
}

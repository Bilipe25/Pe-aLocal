'use client';

import { Check, Copy, MessageCircle } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';

interface PixPaymentInfoProps {
  pixKeyType: string | null;
  pixKey: string | null;
  pixRecipient: string | null;
  pixBank: string | null;
  pixInstructions: string | null;
  total: number;
  orderNumber: number;
  storeWhatsapp: string | null;
  storeName: string;
}

export function PixPaymentInfo({
  pixKeyType,
  pixKey,
  pixRecipient,
  pixBank,
  pixInstructions,
  total,
  orderNumber,
  storeWhatsapp,
  storeName,
}: PixPaymentInfoProps) {
  const [copied, setCopied] = useState(false);

  if (!pixKey) {
    return (
      <div className="rounded-xl border border-pimenta/20 bg-pimenta/5 p-4 text-sm text-tinta">
        Chave Pix não configurada. Entre em contato com a loja.
      </div>
    );
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(pixKey!);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  const totalFormatted = (total / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });

  const whatsappMessage = encodeURIComponent(
    `Olá! Segue o comprovante do pedido #${String(orderNumber).padStart(4, '0')} (${totalFormatted}) na ${storeName}.`,
  );

  const whatsappUrl = storeWhatsapp
    ? `https://wa.me/55${storeWhatsapp.replace(/\D/g, '')}?text=${whatsappMessage}`
    : null;

  return (
    <div className="rounded-xl border border-tinta/10 bg-papel p-4 shadow-sm">
      <h3 className="font-display text-base font-bold text-tinta">Pagamento via Pix</h3>

      <div className="mt-3 space-y-2 text-sm">
        {pixKeyType && (
          <div className="flex justify-between gap-3">
            <span className="text-text-muted">Tipo de chave</span>
            <span className="break-words text-right text-tinta">{pixKeyType}</span>
          </div>
        )}
        <div className="flex items-center justify-between gap-2">
          <span className="shrink-0 text-text-muted">Chave Pix</span>
          <div className="flex min-w-0 items-center gap-1">
            <code className="min-w-0 break-all rounded bg-kraft/50 px-2 py-1 font-mono text-sm font-bold text-tinta">
              {pixKey}
            </code>
            <button
              type="button"
              onClick={handleCopy}
              aria-label={copied ? 'Chave Pix copiada' : 'Copiar chave Pix'}
              className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md text-text-muted hover:bg-tinta/5 hover:text-tinta"
            >
              {copied ? (
                <Check className="h-4 w-4 text-erva" aria-hidden="true" />
              ) : (
                <Copy className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
            <span className="sr-only" role="status" aria-live="polite">
              {copied ? 'Chave Pix copiada para a área de transferência.' : ''}
            </span>
          </div>
        </div>
        {pixRecipient && (
          <div className="flex justify-between gap-3">
            <span className="text-text-muted">Beneficiário</span>
            <span className="break-words text-right text-tinta">{pixRecipient}</span>
          </div>
        )}
        {pixBank && (
          <div className="flex justify-between gap-3">
            <span className="text-text-muted">Banco</span>
            <span className="break-words text-right text-tinta">{pixBank}</span>
          </div>
        )}
        <div className="flex justify-between gap-3 font-semibold">
          <span className="text-tinta">Valor</span>
          <span className="storefront-action-text font-mono font-bold">{totalFormatted}</span>
        </div>
      </div>

      {pixInstructions && (
        <p className="mt-3 break-words text-sm text-text-muted italic">{pixInstructions}</p>
      )}

      {whatsappUrl && (
        <Button
          asChild
          className="mt-3 w-full bg-erva font-body font-medium text-white hover:bg-erva/90"
        >
          <a href={whatsappUrl} target="_blank" rel="noopener noreferrer">
            <MessageCircle className="mr-2 h-4 w-4" aria-hidden="true" />
            Enviar comprovante via WhatsApp
          </a>
        </Button>
      )}
    </div>
  );
}

'use client';

import { useState } from 'react';
import { Copy, Check, MessageCircle } from 'lucide-react';
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
      <div className="rounded-xl border border-pimenta/20 bg-pimenta/5 p-4 text-sm text-tinta/70">
        Chave Pix não configurada. Entre em contato com a loja.
      </div>
    );
  }

  async function handleCopy() {
    if (!pixKey) return;
    await navigator.clipboard.writeText(pixKey);
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
          <div className="flex justify-between">
            <span className="text-tinta/60">Tipo de chave</span>
            <span className="text-tinta">{pixKeyType}</span>
          </div>
        )}
        <div className="flex items-center justify-between gap-2">
          <span className="text-tinta/60">Chave Pix</span>
          <div className="flex items-center gap-1">
            <code className="rounded bg-kraft/50 px-2 py-0.5 font-mono text-xs font-bold text-tinta">
              {pixKey}
            </code>
            <button
              onClick={handleCopy}
              className="rounded-md p-1 text-tinta/50 hover:bg-tinta/5 hover:text-tinta"
              title="Copiar chave"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-erva" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        </div>
        {pixRecipient && (
          <div className="flex justify-between">
            <span className="text-tinta/60">Beneficiário</span>
            <span className="text-tinta">{pixRecipient}</span>
          </div>
        )}
        {pixBank && (
          <div className="flex justify-between">
            <span className="text-tinta/60">Banco</span>
            <span className="text-tinta">{pixBank}</span>
          </div>
        )}
        <div className="flex justify-between font-semibold">
          <span className="text-tinta">Valor</span>
          <span className="font-mono font-bold text-pimenta">{totalFormatted}</span>
        </div>
      </div>

      {pixInstructions && (
        <p className="mt-3 text-xs text-tinta/50 italic">{pixInstructions}</p>
      )}

      {whatsappUrl && (
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 block"
        >
          <Button
            type="button"
            className="w-full bg-erva text-white hover:bg-erva/90 font-body font-medium"
          >
            <MessageCircle className="mr-2 h-4 w-4" />
            Enviar comprovante via WhatsApp
          </Button>
        </a>
      )}
    </div>
  );
}

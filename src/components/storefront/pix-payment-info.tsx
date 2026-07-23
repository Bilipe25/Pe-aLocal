'use client';

import { Check, CheckCircle2, Copy, Loader2, MessageCircle } from 'lucide-react';
import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { reportPixPaymentAction } from '@/features/orders/actions';
import type { PaymentStatus } from '@/types';

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
  publicToken: string;
  paymentStatus: PaymentStatus;
}

const subscribeToPaymentReportToken = () => () => {};

function readPaymentReportToken(publicToken: string): string | null {
  try {
    return window.sessionStorage.getItem(`payment-report:${publicToken}`);
  } catch {
    return null;
  }
}

function copyWithSelectionFallback(value: string) {
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.readOnly = true;
  textarea.setAttribute('aria-hidden', 'true');
  textarea.style.position = 'fixed';
  textarea.style.inset = '0';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);

  try {
    textarea.select();
    return typeof document.execCommand === 'function' && document.execCommand('copy');
  } finally {
    textarea.remove();
  }
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
  publicToken,
  paymentStatus,
}: PixPaymentInfoProps) {
  const [copyStatus, setCopyStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [reportedStatus, setReportedStatus] = useState<PaymentStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const copyStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();
  const reportToken = useSyncExternalStore(
    subscribeToPaymentReportToken,
    () => readPaymentReportToken(publicToken),
    () => null,
  );

  const currentStatus =
    paymentStatus === 'PENDING' ? (reportedStatus ?? paymentStatus) : paymentStatus;

  useEffect(
    () => () => {
      if (copyStatusTimerRef.current) clearTimeout(copyStatusTimerRef.current);
    },
    [],
  );

  function handleReportPayment() {
    setError(null);
    startTransition(async () => {
      try {
        if (!reportToken) return;
        const result = await reportPixPaymentAction({ reportToken });
        if (!result.success) {
          setError(result.error.message);
          return;
        }
        setReportedStatus(result.data.paymentStatus);
        router.refresh();
      } catch {
        setError('Não foi possível informar o pagamento agora. Tente novamente.');
      }
    });
  }

  if (currentStatus === 'CUSTOMER_REPORTED_PAID' || currentStatus === 'PAID') {
    return (
      <div
        className="border-erva/30 bg-success-light text-tinta rounded-xl border p-4 text-sm"
        role="status"
        aria-live="polite"
      >
        <div className="flex items-start gap-3">
          <CheckCircle2 className="text-erva mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <div>
            <h3 className="font-display font-bold">
              {currentStatus === 'PAID' ? 'Pagamento confirmado' : 'Pagamento informado'}
            </h3>
            <p className="text-text-muted mt-1">
              {currentStatus === 'PAID'
                ? 'A loja confirmou o recebimento do seu Pix.'
                : 'A loja recebeu seu aviso e fará a conferência do Pix.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!pixKey) {
    return (
      <div className="border-pimenta/20 bg-pimenta/5 text-tinta rounded-xl border p-4 text-sm">
        Chave Pix não configurada. Entre em contato com a loja.
      </div>
    );
  }

  async function handleCopy() {
    if (copyStatusTimerRef.current) clearTimeout(copyStatusTimerRef.current);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(pixKey!);
      } else if (!copyWithSelectionFallback(pixKey!)) {
        throw new Error('Clipboard indisponível');
      }
      setCopyStatus('success');
      copyStatusTimerRef.current = setTimeout(() => setCopyStatus('idle'), 2500);
    } catch {
      try {
        if (!copyWithSelectionFallback(pixKey!)) throw new Error('Fallback indisponível');
        setCopyStatus('success');
        copyStatusTimerRef.current = setTimeout(() => setCopyStatus('idle'), 2500);
      } catch {
        setCopyStatus('error');
      }
    }
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
    <div className="border-tinta/10 bg-papel rounded-xl border p-4 shadow-sm">
      <h3 className="font-display text-tinta text-base font-bold">Pagamento via Pix</h3>

      <div className="mt-3 space-y-2 text-sm">
        {pixKeyType && (
          <div className="flex justify-between gap-3">
            <span className="text-text-muted">Tipo de chave</span>
            <span className="text-tinta text-right break-words">{pixKeyType}</span>
          </div>
        )}
        <div className="flex items-center justify-between gap-2">
          <span className="text-text-muted shrink-0">Chave Pix</span>
          <div className="flex min-w-0 items-center gap-1">
            <code className="bg-kraft/50 text-tinta min-w-0 rounded px-2 py-1 font-mono text-sm font-bold break-all">
              {pixKey}
            </code>
            <button
              type="button"
              onClick={handleCopy}
              aria-label={copyStatus === 'success' ? 'Chave Pix copiada' : 'Copiar chave Pix'}
              className="text-text-muted hover:bg-tinta/5 hover:text-tinta flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md"
            >
              {copyStatus === 'success' ? (
                <Check className="text-erva h-4 w-4" aria-hidden="true" />
              ) : (
                <Copy className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
        <p
          className={`text-xs ${
            copyStatus === 'error'
              ? 'text-error'
              : copyStatus === 'success'
                ? 'text-success'
                : 'sr-only'
          }`}
          role="status"
          aria-live="polite"
        >
          {copyStatus === 'success'
            ? 'Chave Pix copiada para a área de transferência.'
            : copyStatus === 'error'
              ? 'Não foi possível copiar. Selecione a chave manualmente.'
              : ''}
        </p>
        {pixRecipient && (
          <div className="flex justify-between gap-3">
            <span className="text-text-muted">Beneficiário</span>
            <span className="text-tinta text-right break-words">{pixRecipient}</span>
          </div>
        )}
        {pixBank && (
          <div className="flex justify-between gap-3">
            <span className="text-text-muted">Banco</span>
            <span className="text-tinta text-right break-words">{pixBank}</span>
          </div>
        )}
        <div className="flex justify-between gap-3 font-semibold">
          <span className="text-tinta">Valor</span>
          <span className="storefront-action-text font-mono font-bold">{totalFormatted}</span>
        </div>
      </div>

      {pixInstructions && (
        <p className="text-text-muted mt-3 text-sm break-words italic">{pixInstructions}</p>
      )}

      {whatsappUrl && (
        <Button
          asChild
          className="bg-erva font-body hover:bg-erva/90 mt-3 w-full font-medium text-white"
        >
          <a href={whatsappUrl} target="_blank" rel="noopener noreferrer">
            <MessageCircle className="mr-2 h-4 w-4" aria-hidden="true" />
            Enviar comprovante via WhatsApp
          </a>
        </Button>
      )}

      <Button
        type="button"
        variant="outline"
        className="mt-3 w-full"
        disabled={isPending || !reportToken}
        aria-busy={isPending}
        onClick={handleReportPayment}
      >
        {isPending ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <CheckCircle2 className="mr-2 h-4 w-4" aria-hidden="true" />
        )}
        {isPending ? 'Informando pagamento…' : 'Já paguei'}
      </Button>
      <p className="text-text-muted mt-2 text-xs">
        {reportToken
          ? 'Use esta opção somente depois de concluir o Pix. A loja ainda verificará o recebimento.'
          : 'Para informar o pagamento por aqui, use a mesma aba ou sessão em que o pedido foi realizado.'}
      </p>
      {error && (
        <p className="bg-error-light text-error mt-2 rounded-lg px-3 py-2 text-sm" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

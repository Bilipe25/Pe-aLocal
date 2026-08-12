'use client';

import { Check, Copy, Loader2, QrCode } from 'lucide-react';
import encodeQR from 'qr';
import { useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';

interface PixPresentation {
  creationStatus: 'PENDING' | 'CREATED' | 'RETRYABLE_ERROR' | 'FAILED';
  qrCode: string | null;
  expiresAt: string | null;
}

function remainingLabel(expiresAt: string | null, now: number) {
  if (!expiresAt) return null;
  const remaining = Math.max(0, new Date(expiresAt).getTime() - now);
  if (remaining === 0) return 'Este Pix expirou.';
  const minutes = Math.floor(remaining / 60_000);
  const seconds = Math.floor((remaining % 60_000) / 1_000);
  return `Expira em ${minutes}:${String(seconds).padStart(2, '0')}`;
}

function PixQr({ value }: { value: string }) {
  const qr = useMemo(() => {
    try {
      const matrix = encodeQR(value, 'raw', { ecc: 'medium', border: 4, scale: 1 });
      const path = matrix
        .flatMap((row, y) => row.flatMap((filled, x) => (filled ? [`M${x} ${y}h1v1h-1z`] : [])))
        .join('');
      return { size: matrix.length, path };
    } catch {
      return null;
    }
  }, [value]);
  if (!qr) return null;
  return (
    <svg
      viewBox={`0 0 ${qr.size} ${qr.size}`}
      className="h-52 w-52"
      role="img"
      aria-label="QR Code Pix"
      shapeRendering="crispEdges"
    >
      <rect width={qr.size} height={qr.size} fill="white" />
      <path d={qr.path} fill="currentColor" />
    </svg>
  );
}

export function OnlinePixPayment({
  storeSlug,
  publicToken,
  initialPayment,
}: {
  storeSlug: string;
  publicToken: string;
  initialPayment: PixPresentation;
}) {
  const [payment, setPayment] = useState(initialPayment);
  const [copied, setCopied] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (payment.creationStatus === 'FAILED') return;
    const controller = new AbortController();
    const synchronize = () => {
      void fetch(
        `/api/storefront/${encodeURIComponent(storeSlug)}/orders/${encodeURIComponent(publicToken)}/pix`,
        { method: 'POST', cache: 'no-store', signal: controller.signal },
      )
        .then(async (response) => {
          if (!response.ok) return null;
          return (await response.json()) as {
            paymentStatus?: string;
            payment?: PixPresentation | null;
          };
        })
        .then((result) => {
          if (result?.payment) setPayment(result.payment);
          if (result?.paymentStatus && result.paymentStatus !== 'PENDING') setCompleted(true);
        })
        .catch(() => undefined);
    };
    if (payment.creationStatus !== 'CREATED') synchronize();
    const timer = window.setInterval(synchronize, 15_000);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [payment.creationStatus, publicToken, storeSlug]);

  useEffect(() => {
    if (!payment.expiresAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [payment.expiresAt]);

  const copyCode = async () => {
    if (!payment.qrCode) return;
    await navigator.clipboard.writeText(payment.qrCode);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2_000);
  };

  if (completed) return null;

  if (!payment.qrCode) {
    return (
      <section className="storefront-tracking-card" aria-live="polite">
        <div className="flex items-center gap-3">
          {payment.creationStatus === 'FAILED' ? (
            <QrCode className="text-error h-6 w-6" aria-hidden="true" />
          ) : (
            <Loader2 className="text-brand-600 h-6 w-6 animate-spin" aria-hidden="true" />
          )}
          <div>
            <h3 className="storefront-tracking-card-title">
              {payment.creationStatus === 'FAILED' ? 'Pix indisponível' : 'Gerando seu Pix'}
            </h3>
            <p className="text-text-secondary mt-1 text-sm">
              {payment.creationStatus === 'FAILED'
                ? 'Não foi possível gerar a cobrança. Tente fazer um novo pedido.'
                : 'Aguarde alguns instantes. Você não precisa criar outro pedido.'}
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="storefront-tracking-card" aria-labelledby="online-pix-title">
      <div className="text-center">
        <h3 id="online-pix-title" className="storefront-tracking-card-title">
          Pague com Pix
        </h3>
        <p className="text-text-secondary mt-1 text-sm">A confirmação é automática.</p>
      </div>
      <div className="mt-4 flex justify-center text-black">
        <PixQr value={payment.qrCode} />
      </div>
      <p className="text-text-secondary mt-3 text-center text-sm font-semibold">
        {remainingLabel(payment.expiresAt, now)}
      </p>
      <Button type="button" className="mt-4 w-full gap-2" onClick={() => void copyCode()}>
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        {copied ? 'Código copiado' : 'Copiar código Pix'}
      </Button>
    </section>
  );
}

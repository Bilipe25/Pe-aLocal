'use client';

import { Check, Copy, ExternalLink, Loader2, QrCode } from 'lucide-react';
import encodeQR from 'qr';
import { useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import type { CartSnapshot } from '@/stores/cart-store';
import { useCartStore } from '@/stores/cart-store';

interface PixPresentation {
  creationStatus: 'PENDING' | 'CREATED' | 'RETRYABLE_ERROR' | 'FAILED';
  qrCode: string | null;
  ticketUrl: string | null;
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
  const [copyError, setCopyError] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const rebuildCart = () => {
    try {
      const serialized = window.sessionStorage.getItem(`online-order-cart:${publicToken}`);
      if (!serialized) throw new Error('cart-backup-unavailable');
      const backup = JSON.parse(serialized) as { storeId: string; snapshot: CartSnapshot };
      const cart = useCartStore.getState();
      cart.setStore(backup.storeId, storeSlug);
      cart.restoreSnapshot(backup.snapshot, useCartStore.getState().revision);
      window.location.assign(`/${encodeURIComponent(storeSlug)}/cart`);
    } catch {
      window.location.assign(`/${encodeURIComponent(storeSlug)}`);
    }
  };

  useEffect(() => {
    if (payment.creationStatus === 'FAILED' || completed) return;
    const controller = new AbortController();
    let timer: number | undefined;
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
    const canSynchronize = () => document.visibilityState === 'visible' && navigator.onLine;
    const schedule = () => {
      if (timer !== undefined) window.clearTimeout(timer);
      if (!canSynchronize()) return;
      timer = window.setTimeout(async () => {
        synchronize();
        schedule();
      }, 15_000);
    };
    const resume = () => {
      if (canSynchronize()) {
        synchronize();
        schedule();
      } else if (timer !== undefined) {
        window.clearTimeout(timer);
      }
    };
    resume();
    window.addEventListener('online', resume);
    window.addEventListener('offline', resume);
    document.addEventListener('visibilitychange', resume);
    return () => {
      controller.abort();
      if (timer !== undefined) window.clearTimeout(timer);
      window.removeEventListener('online', resume);
      window.removeEventListener('offline', resume);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [completed, payment.creationStatus, publicToken, storeSlug]);

  useEffect(() => {
    if (!payment.expiresAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [payment.expiresAt]);

  const copyCode = async () => {
    if (!payment.qrCode) return;
    setCopyError(false);
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard-unavailable');
      await navigator.clipboard.writeText(payment.qrCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2_000);
    } catch {
      setCopied(false);
      setCopyError(true);
    }
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
            {payment.creationStatus === 'FAILED' ? (
              <Button type="button" variant="outline" className="mt-3" onClick={rebuildCart}>
                Refazer este pedido
              </Button>
            ) : null}
          </div>
        </div>
      </section>
    );
  }

  const expired = Boolean(payment.expiresAt && new Date(payment.expiresAt).getTime() <= now);
  const expirationLabel = remainingLabel(payment.expiresAt, now);

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
      {expirationLabel ? (
        <p className="text-text-secondary mt-3 text-center text-sm font-semibold">
          {expirationLabel}
        </p>
      ) : null}
      <label htmlFor="pix-copy-code" className="text-tinta mt-4 block text-sm font-semibold">
        Pix Copia e Cola
      </label>
      <textarea
        id="pix-copy-code"
        readOnly
        rows={3}
        value={payment.qrCode}
        onFocus={(event) => event.currentTarget.select()}
        className="border-tinta/15 bg-papel text-tinta mt-1 w-full resize-none rounded-xl border p-3 font-mono text-xs leading-relaxed break-all focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        aria-describedby="pix-copy-help"
      />
      <p id="pix-copy-help" className="text-text-secondary mt-1.5 text-xs">
        Se a cópia automática falhar, toque no código para selecioná-lo manualmente.
      </p>
      <Button
        type="button"
        className="mt-4 w-full gap-2"
        disabled={expired}
        onClick={() => void copyCode()}
      >
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        {copied ? 'Código copiado' : 'Copiar código Pix'}
      </Button>
      {copyError ? (
        <p className="text-error mt-2 text-center text-sm" role="alert">
          Não foi possível copiar automaticamente. Tente abrir o Pix ou copie pelo seu dispositivo.
        </p>
      ) : null}
      {!expired && payment.ticketUrl ? (
        <Button asChild type="button" variant="outline" className="mt-2 w-full gap-2">
          <a href={payment.ticketUrl} target="_blank" rel="noreferrer">
            <ExternalLink className="h-4 w-4" aria-hidden="true" /> Abrir Pix
          </a>
        </Button>
      ) : null}
      {expired ? (
        <Button type="button" variant="outline" className="mt-2 w-full" onClick={rebuildCart}>
          Refazer este pedido
        </Button>
      ) : null}
    </section>
  );
}

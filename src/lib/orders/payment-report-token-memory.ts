'use client';

const DEFAULT_PAYMENT_REPORT_TOKEN_TTL_MS = 30 * 60 * 1_000;

type Listener = () => void;

interface PaymentReportTokenEntry {
  reportToken: string;
  expiresAt: number;
  expirationTimer: ReturnType<typeof setTimeout>;
}

const entries = new Map<string, PaymentReportTokenEntry>();
const listeners = new Map<string, Set<Listener>>();

function notify(publicToken: string) {
  for (const listener of listeners.get(publicToken) ?? []) {
    listener();
  }
}

/**
 * Mantém o token sensível apenas na memória desta execução do navegador.
 *
 * Um reload descarta o token intencionalmente. Ele nunca deve ser persistido
 * em URL, cookie, localStorage ou sessionStorage.
 */
export function storePaymentReportToken(
  publicToken: string,
  reportToken: string,
  ttlMs = DEFAULT_PAYMENT_REPORT_TOKEN_TTL_MS,
) {
  clearPaymentReportToken(publicToken);

  if (!publicToken || !reportToken || !Number.isFinite(ttlMs) || ttlMs <= 0) {
    return;
  }

  const expirationTimer = setTimeout(() => {
    const entry = entries.get(publicToken);
    if (!entry || entry.reportToken !== reportToken) return;
    entries.delete(publicToken);
    notify(publicToken);
  }, ttlMs);
  expirationTimer.unref?.();

  entries.set(publicToken, {
    reportToken,
    expiresAt: Date.now() + ttlMs,
    expirationTimer,
  });
  notify(publicToken);
}

export function readPaymentReportToken(publicToken: string): string | null {
  const entry = entries.get(publicToken);
  if (!entry) return null;

  if (entry.expiresAt <= Date.now()) {
    clearPaymentReportToken(publicToken);
    return null;
  }

  return entry.reportToken;
}

export function clearPaymentReportToken(publicToken: string) {
  const entry = entries.get(publicToken);
  if (!entry) return;

  clearTimeout(entry.expirationTimer);
  entries.delete(publicToken);
  notify(publicToken);
}

export function subscribeToPaymentReportToken(publicToken: string, listener: Listener) {
  const tokenListeners = listeners.get(publicToken) ?? new Set<Listener>();
  tokenListeners.add(listener);
  listeners.set(publicToken, tokenListeners);

  return () => {
    tokenListeners.delete(listener);
    if (tokenListeners.size === 0) listeners.delete(publicToken);
  };
}

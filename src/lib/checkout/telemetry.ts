export type CheckoutTelemetryEvent =
  | 'checkout_started'
  | 'checkout_step_viewed'
  | 'checkout_abandoned'
  | 'checkout_quote_changed'
  | 'checkout_completed';

export type CheckoutTelemetryStep = 'identification' | 'fulfillment' | 'payment' | 'review';

interface CheckoutTelemetryPayload {
  event: CheckoutTelemetryEvent;
  step?: CheckoutTelemetryStep;
  reason?: 'navigation' | 'page_hidden' | 'quote_changed';
}

function endpoint(storeSlug: string) {
  return `/api/storefront/${encodeURIComponent(storeSlug)}/checkout/events`;
}

export function reportCheckoutEvent(storeSlug: string, payload: CheckoutTelemetryPayload) {
  if (typeof window === 'undefined') return;
  void fetch(endpoint(storeSlug), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    cache: 'no-store',
    keepalive: true,
  }).catch(() => {
    // Telemetria nunca deve interromper ou degradar o checkout.
  });
}

export function reportCheckoutAbandonment(
  storeSlug: string,
  step: CheckoutTelemetryStep,
  reason: 'navigation' | 'page_hidden' = 'navigation',
) {
  if (typeof navigator === 'undefined') return;
  const body = JSON.stringify({ event: 'checkout_abandoned', step, reason });
  if (typeof navigator.sendBeacon === 'function') {
    const accepted = navigator.sendBeacon(
      endpoint(storeSlug),
      new Blob([body], { type: 'application/json' }),
    );
    if (accepted) return;
  }
  reportCheckoutEvent(storeSlug, { event: 'checkout_abandoned', step, reason });
}

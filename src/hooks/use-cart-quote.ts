'use client';

import { useEffect, useMemo, useState } from 'react';

import type { CartItem } from '@/stores/cart-store';
import type { CheckoutQuoteDto } from '@/types/storefront';

export type CartFulfillmentModality = 'DELIVERY' | 'PICKUP';
export type CartQuoteStatus = 'idle' | 'waiting' | 'loading' | 'success' | 'error';

interface UseCartQuoteInput {
  storeSlug: string;
  items: CartItem[];
  revision: number;
  modality: CartFulfillmentModality;
}

function responseErrorMessage(payload: unknown) {
  if (
    payload &&
    typeof payload === 'object' &&
    'message' in payload &&
    typeof payload.message === 'string'
  ) {
    return payload.message;
  }
  return 'Não foi possível atualizar os valores agora.';
}

export function useCartQuote({
  storeSlug,
  items,
  revision,
  modality,
}: UseCartQuoteInput) {
  const [quote, setQuote] = useState<CheckoutQuoteDto | null>(null);
  const [status, setStatus] = useState<CartQuoteStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [resolvedRequestKey, setResolvedRequestKey] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const requestBody = useMemo(
    () => ({
      modality,
      items: items.map((item) => ({
        lineId: item.id,
        productId: item.productId,
        quantity: item.quantity,
        notes: item.notes || undefined,
        optionIds: item.selectedOptions.map((option) => option.id),
      })),
    }),
    [items, modality],
  );
  const requestKey = useMemo(() => JSON.stringify(requestBody), [requestBody]);
  const canRequest = items.length > 0;

  useEffect(() => {
    if (!canRequest) return;

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setResolvedRequestKey(requestKey);
      setStatus('loading');
      setError(null);
      try {
        const response = await fetch(
          `/api/storefront/${encodeURIComponent(storeSlug)}/checkout/quote?context=cart`,
          {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
            cache: 'no-store',
            signal: controller.signal,
          },
        );
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok) throw new Error(responseErrorMessage(payload));
        setQuote(payload as CheckoutQuoteDto);
        setStatus('success');
      } catch (caught) {
        if (controller.signal.aborted) return;
        setQuote(null);
        setStatus('error');
        setError(
          caught instanceof Error ? caught.message : 'Não foi possível atualizar os valores agora.',
        );
      }
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [canRequest, requestBody, requestKey, retryKey, revision, storeSlug]);

  const visibleState =
    !canRequest || resolvedRequestKey !== requestKey
      ? {
          quote: null,
          status: items.length === 0 ? ('idle' as const) : ('waiting' as const),
          error: null,
        }
      : { quote, status, error };

  return {
    ...visibleState,
    retry: () => {
      setResolvedRequestKey(null);
      setRetryKey((current) => current + 1);
    },
  };
}

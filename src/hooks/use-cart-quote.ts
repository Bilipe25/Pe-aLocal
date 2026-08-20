'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import type { CartItem } from '@/stores/cart-store';
import type { CheckoutQuoteDto } from '@/types/storefront';

export type CartFulfillmentModality = 'DELIVERY' | 'PICKUP' | 'DINE_IN';
export type CartQuoteStatus = 'idle' | 'waiting' | 'loading' | 'success' | 'error';

interface UseCartQuoteInput {
  storeSlug: string;
  items: CartItem[];
  revision: number;
  modality: CartFulfillmentModality;
  couponCode?: string | null;
  enabled?: boolean;
  quoteEndpoint?: string;
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
  couponCode,
  enabled = true,
  quoteEndpoint,
}: UseCartQuoteInput) {
  const [quote, setQuote] = useState<CheckoutQuoteDto | null>(null);
  const [status, setStatus] = useState<CartQuoteStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [resolvedRequestKey, setResolvedRequestKey] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const hasRequestedRef = useRef(false);
  const requestBody = useMemo(() => {
    const normalizedCouponCode = couponCode?.trim().toUpperCase();
    return {
      ...(modality === 'DINE_IN' ? {} : { modality }),
      couponCode: normalizedCouponCode || undefined,
      items: items.map((item) => ({
        lineId: item.id,
        productId: item.productId,
        quantity: item.quantity,
        notes: item.notes || undefined,
        optionIds: item.selectedOptions.map((option) => option.id),
      })),
    };
  }, [couponCode, items, modality]);
  const requestKey = useMemo(() => JSON.stringify(requestBody), [requestBody]);
  const canRequest = enabled && items.length > 0;

  useEffect(() => {
    if (!canRequest) {
      hasRequestedRef.current = false;
      return;
    }

    const controller = new AbortController();
    // A primeira cotação também completa imagens ausentes de carrinhos antigos: ela
    // precisa começar imediatamente. As alterações seguintes continuam agrupadas.
    const delay = hasRequestedRef.current && retryKey === 0 ? 250 : 0;
    const timer = window.setTimeout(async () => {
      hasRequestedRef.current = true;
      setResolvedRequestKey(requestKey);
      setStatus('loading');
      setError(null);
      try {
        const response = await fetch(
          quoteEndpoint ??
            `/api/storefront/${encodeURIComponent(storeSlug)}/checkout/quote?context=cart`,
          {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
            },
            body: requestKey,
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
    }, delay);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [canRequest, quoteEndpoint, requestKey, retryKey, revision, storeSlug]);

  const visibleState =
    !enabled || !canRequest || resolvedRequestKey !== requestKey
      ? {
          quote: null,
          status: !enabled || items.length === 0 ? ('idle' as const) : ('waiting' as const),
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

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import type { CheckoutQuoteInput } from '@/schemas/checkout';
import type { CheckoutQuoteDto } from '@/types/storefront';

interface QuoteError {
  code: string;
  message: string;
}

interface UseCheckoutQuoteOptions {
  storeSlug: string;
  input: CheckoutQuoteInput | Omit<CheckoutQuoteInput, 'modality'> | null;
  quoteEndpoint?: string;
  enabled?: boolean;
  debounceMs?: number;
}

export function useCheckoutQuote({
  storeSlug,
  input,
  quoteEndpoint,
  enabled = true,
  debounceMs = 250,
}: UseCheckoutQuoteOptions) {
  const [quote, setQuote] = useState<CheckoutQuoteDto | null>(null);
  const [error, setError] = useState<QuoteError | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const requestSequence = useRef(0);

  const requestQuote = useCallback(
    async (signal?: AbortSignal) => {
      if (!enabled || !input) {
        setQuote(null);
        setError(null);
        setIsLoading(false);
        return null;
      }

      const sequence = ++requestSequence.current;
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(
          quoteEndpoint ?? `/api/storefront/${encodeURIComponent(storeSlug)}/checkout/quote`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(input),
            cache: 'no-store',
            signal,
          },
        );
        const body = (await response.json()) as
          CheckoutQuoteDto | { code?: string; message?: string };

        if (!response.ok) {
          throw {
            code:
              typeof body === 'object' && body && 'code' in body && typeof body.code === 'string'
                ? body.code
                : 'QUOTE_UNAVAILABLE',
            message:
              typeof body === 'object' &&
              body &&
              'message' in body &&
              typeof body.message === 'string'
                ? body.message
                : 'Não foi possível atualizar os valores agora.',
          } satisfies QuoteError;
        }

        if (sequence === requestSequence.current) {
          setQuote(body as CheckoutQuoteDto);
          setLastUpdatedAt(Date.now());
          setError(null);
        }
        return body as CheckoutQuoteDto;
      } catch (requestError) {
        if (signal?.aborted || sequence !== requestSequence.current) return null;
        const nextError =
          requestError &&
          typeof requestError === 'object' &&
          'message' in requestError &&
          typeof requestError.message === 'string'
            ? {
                code:
                  'code' in requestError && typeof requestError.code === 'string'
                    ? requestError.code
                    : 'NETWORK_ERROR',
                message: requestError.message,
              }
            : {
                code: 'NETWORK_ERROR',
                message:
                  typeof navigator !== 'undefined' && !navigator.onLine
                    ? 'Você está sem conexão. Reconecte para atualizar o pedido.'
                    : 'Não foi possível atualizar o pedido. Tente novamente.',
              };
        setError(nextError);
        return null;
      } finally {
        if (sequence === requestSequence.current) setIsLoading(false);
      }
    },
    [enabled, input, quoteEndpoint, storeSlug],
  );

  useEffect(() => {
    if (!enabled || !input) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void requestQuote(controller.signal);
    }, debounceMs);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [debounceMs, enabled, input, requestQuote]);

  return {
    quote: enabled && input ? quote : null,
    error: enabled && input ? error : null,
    isLoading: enabled && input ? isLoading : false,
    lastUpdatedAt: enabled && input ? lastUpdatedAt : null,
    refetch: requestQuote,
  };
}

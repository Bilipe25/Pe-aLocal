'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const FAVORITE_FEEDBACK_DURATION_MS = 280;

export function useFavoriteFeedback(isFavorite: boolean) {
  const [isPulsing, setIsPulsing] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const trigger = useCallback(() => {
    if (isFavorite) return;

    if (typeof navigator !== 'undefined') {
      try {
        navigator.vibrate?.(12);
      } catch {
        // Alguns navegadores expõem vibrate, mas bloqueiam a chamada fora de um gesto válido.
      }
    }

    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setIsPulsing(true);
    timeoutRef.current = setTimeout(() => {
      timeoutRef.current = null;
      setIsPulsing(false);
    }, FAVORITE_FEEDBACK_DURATION_MS);
  }, [isFavorite]);

  return { isPulsing, trigger };
}

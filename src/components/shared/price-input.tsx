'use client';

import * as React from 'react';
import { Input } from '@/components/ui/input';

interface PriceInputProps extends Omit<React.ComponentProps<'input'>, 'onChange' | 'value' | 'type'> {
  /** Preço em reais (ex: 24.90) */
  defaultPrice?: number;
  name: string;
}

/**
 * Input de preço em reais com prefixo R$.
 * Usa input nativo com step 0.01 — simples e acessível.
 */
export function PriceInput({ defaultPrice = 0, name, ...props }: PriceInputProps) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-text-secondary" aria-hidden="true">
        R$
      </span>
      <Input
        {...props}
        type="number"
        inputMode="decimal"
        step="0.01"
        min="0"
        name={name}
        defaultValue={defaultPrice.toFixed(2)}
        className="pl-10"
      />
    </div>
  );
}

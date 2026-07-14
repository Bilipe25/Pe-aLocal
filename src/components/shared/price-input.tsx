'use client';

import * as React from 'react';
import { Input } from '@/components/ui/input';

interface PriceInputProps extends Omit<React.ComponentProps<'input'>, 'onChange' | 'value'> {
  value: number; // em reais (ex: 24.90)
  onChange: (value: number) => void;
}

/**
 * Input de preço em reais.
 * Aceita input do usuário em reais (24.90) e converte automaticamente.
 */
export function PriceInput({ value, onChange, ...props }: PriceInputProps) {
  const [displayValue, setDisplayValue] = React.useState(value.toFixed(2));

  React.useEffect(() => {
    setDisplayValue(value.toFixed(2));
  }, [value]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/[^0-9.,]/g, '').replace(',', '.');
    setDisplayValue(raw);

    const num = parseFloat(raw);
    if (!isNaN(num) && num >= 0) {
      onChange(num);
    }
  }

  function handleBlur() {
    const num = parseFloat(displayValue);
    if (isNaN(num) || num < 0) {
      setDisplayValue('0.00');
      onChange(0);
    } else {
      setDisplayValue(num.toFixed(2));
      onChange(num);
    }
  }

  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-text-tertiary">
        R$
      </span>
      <Input
        {...props}
        type="text"
        inputMode="decimal"
        value={displayValue}
        onChange={handleChange}
        onBlur={handleBlur}
        className="pl-10"
      />
    </div>
  );
}

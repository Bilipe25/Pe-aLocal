import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { OptionGroupSelector } from '@/components/storefront/option-group-selector';
import type { SelectedOption } from '@/stores/cart-store';
import type { PublicStorefrontOptionGroupDto } from '@/types/storefront';

const requiredGroup: PublicStorefrontOptionGroupDto = {
  id: 'size',
  title: 'Escolha o tamanho',
  description: null,
  isRequired: true,
  isMultiple: false,
  minSelections: 1,
  maxSelections: 1,
  options: [
    { id: 'small', name: 'Pequeno', price: 0 },
    { id: 'large', name: 'Grande', price: 500 },
  ],
};

function ControlledSelector({ group = requiredGroup }: { group?: PublicStorefrontOptionGroupDto }) {
  const [selected, setSelected] = useState<SelectedOption[]>([]);
  return <OptionGroupSelector group={group} selected={selected} onChange={setSelected} />;
}

describe('seletor de opções do storefront', () => {
  it('implementa roving tabindex e navegação de radiogroup por setas', () => {
    render(<ControlledSelector />);

    const small = screen.getByRole('radio', { name: 'Pequeno' });
    const large = screen.getByRole('radio', { name: /Grande/ });
    expect(screen.getByRole('radiogroup')).toHaveAttribute('aria-required', 'true');
    expect(small).toHaveAttribute('tabindex', '0');
    expect(large).toHaveAttribute('tabindex', '-1');

    small.focus();
    fireEvent.keyDown(small, { key: 'ArrowDown' });

    expect(large).toHaveFocus();
    expect(large).toHaveAttribute('aria-checked', 'true');
    expect(large).toHaveAttribute('tabindex', '0');
    expect(small).toHaveAttribute('tabindex', '-1');
  });

  it('não limpa uma escolha obrigatória ao tocar novamente', () => {
    render(<ControlledSelector />);

    const small = screen.getByRole('radio', { name: 'Pequeno' });
    fireEvent.click(small);
    fireEvent.click(small);

    expect(small).toHaveAttribute('aria-checked', 'true');
  });
});

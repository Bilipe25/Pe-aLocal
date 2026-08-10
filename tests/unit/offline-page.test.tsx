import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import OfflinePage from '@/app/offline/page';

describe('página offline', () => {
  it('funciona sem hidratação e oferece retry GET', () => {
    const { container } = render(<OfflinePage />);

    expect(screen.getByRole('heading', { name: 'Você está offline' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toHaveStyle({
      minHeight: '44px',
    });
    expect(container.querySelector('form')).toHaveAttribute('method', 'get');
    expect(container.textContent).not.toMatch(/pedido|carrinho|salvo/i);
  });
});

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DiningSessionActions } from '@/components/storefront/dining-session-actions';

const mocks = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock('@/features/dining-room/actions', () => ({
  requestDiningServiceAction: mocks.request,
}));

describe('ações públicas da sessão de mesa', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.request.mockResolvedValue({
      success: true,
      data: {
        type: 'ASSISTANCE',
        status: 'OPEN',
        created: true,
        createdAt: new Date().toISOString(),
      },
    });
  });

  it('expõe somente pedir novamente, atendimento e conta', () => {
    render(
      <DiningSessionActions
        sessionToken={'S'.repeat(43)}
        continueOrderingHref="/q/s/session/menu"
      />,
    );
    expect(screen.getByRole('link', { name: /fazer outro pedido/i })).toHaveAttribute(
      'href',
      '/q/s/session/menu',
    );
    expect(screen.getByRole('button', { name: /chamar atendimento/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /pedir a conta/i })).toBeEnabled();
    expect(screen.queryByText(/total|telefone|pagamento/i)).not.toBeInTheDocument();
  });

  it('confirma de forma durável sem permitir cliques repetidos', async () => {
    render(
      <DiningSessionActions
        sessionToken={'S'.repeat(43)}
        continueOrderingHref="/q/s/session/menu"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /chamar atendimento/i }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /equipe avisada/i })).toBeDisabled(),
    );
    expect(mocks.request).toHaveBeenCalledOnce();
  });
});

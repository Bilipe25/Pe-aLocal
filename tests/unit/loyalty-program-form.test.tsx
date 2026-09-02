import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LoyaltyProgramForm } from '@/features/loyalty/components/loyalty-program-form';

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  save: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

vi.mock('@/features/loyalty/actions', () => ({
  saveLoyaltyProgramAction: mocks.save,
}));

const initial = {
  version: 3,
  requiredOrders: 6,
  rewardType: 'FIXED_DISCOUNT' as const,
  rewardValue: 1_200,
  percentageBasisPoints: null,
  maximumDiscountValue: null,
  freeProductId: null,
  freeProductNameSnapshot: null,
  validityDays: 90,
  minimumOrderValue: 5_000,
  isActive: true,
};

const products = [
  { id: '4da03571-bffd-45ef-8c44-20686c487838', name: 'Brownie', basePrice: 800, isSoldOut: false },
  { id: 'a665460d-b4be-48e6-8cb2-33ab2e5cc8a1', name: 'Cookie', basePrice: 600, isSoldOut: true },
];

describe('configuração de fidelidade', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.save.mockResolvedValue({ success: true, data: undefined });
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
  });

  it('aplica templates como estratégias completas e informa o que será substituído', () => {
    render(<LoyaltyProgramForm initial={initial} canEdit advancedEnabled products={products} />);

    fireEvent.change(screen.getByLabelText('Pedido mínimo'), { target: { value: '99,00' } });
    fireEvent.click(screen.getByLabelText('90 dias'));
    fireEvent.click(screen.getByRole('button', { name: /Simples/ }));

    expect(screen.getByLabelText('A cada quantos pedidos?')).toHaveValue(5);
    expect(screen.getByLabelText('Valor do desconto')).toHaveValue('10,00');
    expect(screen.getByLabelText('Pedido mínimo')).toHaveValue('30,00');
    expect(screen.getByLabelText('30 dias')).toBeChecked();
    expect(screen.getByRole('button', { name: /Simples/ })).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.getByText(/Aplicar substitui frequência, benefício, pedido mínimo e validade/),
    ).toBeVisible();
  });

  it('mostra erro junto ao campo e não publica dados inválidos', () => {
    render(<LoyaltyProgramForm initial={initial} canEdit advancedEnabled products={products} />);

    const requiredOrders = screen.getByLabelText('A cada quantos pedidos?');
    fireEvent.change(requiredOrders, { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar e ativar fidelidade' }));

    expect(requiredOrders).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Use pelo menos 2 pedidos.')).toBeVisible();
    expect(screen.getByRole('alert')).toHaveTextContent('ainda não foi publicada');
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('restaura a versão publicada e confirma a nova publicação', async () => {
    render(<LoyaltyProgramForm initial={initial} canEdit advancedEnabled products={products} />);

    expect(screen.getByText('Publicada e ativa')).toBeVisible();
    expect(screen.getByText('Versão 3')).toBeVisible();
    fireEvent.change(screen.getByLabelText('A cada quantos pedidos?'), { target: { value: '9' } });
    expect(screen.getByText('Alterações pendentes')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Restaurar versão publicada' }));
    expect(screen.getByLabelText('A cada quantos pedidos?')).toHaveValue(6);

    fireEvent.change(screen.getByLabelText('A cada quantos pedidos?'), { target: { value: '7' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar e ativar fidelidade' }));

    await waitFor(() => expect(mocks.save).toHaveBeenCalledOnce());
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ requiredOrders: 7 }));
    expect(
      await screen.findByText('Nova configuração publicada. A fidelidade está ativa.'),
    ).toBeVisible();
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it('impede que um produto esgotado seja escolhido na nova versão', () => {
    render(<LoyaltyProgramForm initial={initial} canEdit advancedEnabled products={products} />);

    fireEvent.click(screen.getByLabelText('Produto grátis'));
    const soldOutOption = screen.getByRole('option', { name: 'Cookie — esgotado agora' });
    expect(soldOutOption).toBeDisabled();
  });
});

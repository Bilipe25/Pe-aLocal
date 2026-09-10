import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ createCampaign: vi.fn() }));

vi.mock('@/features/customers/actions', () => ({
  createCustomerReturnCampaignAction: mocks.createCampaign,
}));

import { ReturnCampaignForm } from '@/features/customers/components/return-campaign-form';

describe('Volta pra cá form', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createCampaign.mockResolvedValue({
      success: true,
      data: { campaignId: 'campaign-a', recipients: 7, consented: 0 },
    });
  });

  it('exige uma revisão legível antes de criar os benefícios', async () => {
    render(
      <ReturnCampaignForm
        audience={{ cooling: 4, inactive: 3, total: 7 }}
        advancedEnabled={false}
        products={[]}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Confirmar e ativar' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Revisar ação' }));

    expect(screen.getByRole('heading', { name: 'Confira antes de ativar' })).toBeVisible();
    expect(screen.getByText('7 clientes')).toBeVisible();
    expect(screen.getByText(/R\$\s*5,00 de desconto/)).toBeVisible();
    expect(mocks.createCampaign).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar e ativar' }));
    await waitFor(() => expect(mocks.createCampaign).toHaveBeenCalledOnce());
    expect(mocks.createCampaign).toHaveBeenCalledWith(
      expect.objectContaining({
        target: 'COOLING_AND_INACTIVE',
        rewardType: 'FIXED_DISCOUNT',
        rewardValue: 500,
        minimumOrderValue: 3_500,
        validityDays: 7,
      }),
    );
  });

  it('permite voltar da revisão sem criar a campanha', () => {
    render(
      <ReturnCampaignForm
        audience={{ cooling: 4, inactive: 0, total: 4 }}
        advancedEnabled={false}
        products={[]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Revisar ação' }));
    fireEvent.click(screen.getByRole('button', { name: 'Voltar e ajustar' }));

    expect(screen.getByRole('button', { name: 'Revisar ação' })).toBeVisible();
    expect(screen.getByLabelText('Valor do desconto em reais')).toHaveValue('5');
    expect(mocks.createCampaign).not.toHaveBeenCalled();
  });
});

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  reportPixPaymentAction: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('@/features/orders/actions', () => ({
  reportPixPaymentAction: mocks.reportPixPaymentAction,
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

import { PixPaymentInfo } from '@/components/storefront/pix-payment-info';

const props = {
  pixKeyType: 'E-mail',
  pixKey: 'financeiro@loja.test',
  pixRecipient: 'Loja Teste',
  pixBank: 'Banco',
  pixInstructions: null,
  total: 2500,
  orderNumber: 12,
  storeWhatsapp: null,
  storeName: 'Loja Teste',
  publicToken: '4da03571-bffd-45ef-8c44-20686c487838',
  paymentStatus: 'PENDING' as const,
};

describe('PixPaymentInfo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.setItem(`payment-report:${props.publicToken}`, 'report-token-a');
    mocks.reportPixPaymentAction.mockResolvedValue({
      success: true,
      data: {
        paymentStatus: 'CUSTOMER_REPORTED_PAID',
        version: 1,
        notificationPending: false,
      },
    });
  });

  it('informa pagamento e apresenta estado aguardando conferência', async () => {
    render(<PixPaymentInfo {...props} />);

    fireEvent.click(screen.getByRole('button', { name: 'Já paguei' }));

    await waitFor(() => {
      expect(screen.getByText('Pagamento informado')).toBeInTheDocument();
    });
    expect(mocks.reportPixPaymentAction).toHaveBeenCalledWith({
      reportToken: 'report-token-a',
    });
    expect(mocks.refresh).toHaveBeenCalledOnce();
  }, 10_000);

  it('mantém instruções e mostra erro seguro quando o relato falha', async () => {
    mocks.reportPixPaymentAction.mockResolvedValue({
      success: false,
      error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Aguarde antes de tentar novamente.' },
    });
    render(<PixPaymentInfo {...props} />);

    fireEvent.click(screen.getByRole('button', { name: 'Já paguei' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Aguarde antes de tentar novamente.',
    );
    expect(screen.getByText('financeiro@loja.test')).toBeInTheDocument();
  });
});

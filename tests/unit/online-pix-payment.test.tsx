import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { OnlinePixPayment } from '@/components/storefront/online-pix-payment';

const mocks = vi.hoisted(() => ({ reportCheckoutConversionEvent: vi.fn() }));

vi.mock('@/lib/checkout/telemetry', () => ({
  reportCheckoutConversionEvent: mocks.reportCheckoutConversionEvent,
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('OnlinePixPayment', () => {
  it('continua sincronizando depois que o QR foi criado e mostra fallback copiável', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        paymentStatus: 'PENDING',
        payment: {
          creationStatus: 'CREATED',
          qrCode: '00020101021226890014br.gov.bcb.pix',
          ticketUrl: null,
          expiresAt: '2099-08-13T03:00:00.000Z',
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <OnlinePixPayment
        storeSlug="loja-teste"
        publicToken="public-token"
        timeZone="America/Sao_Paulo"
        initialPayment={{
          creationStatus: 'CREATED',
          qrCode: '00020101021226890014br.gov.bcb.pix',
          ticketUrl: null,
          expiresAt: '2099-08-13T03:00:00.000Z',
        }}
      />,
    );

    expect(screen.getByRole('img', { name: 'QR Code Pix' })).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Pix Copia e Cola' })).toHaveValue(
      '00020101021226890014br.gov.bcb.pix',
    );
    expect(screen.getByText(/Válido até 13\/08 às 00:00/)).toBeVisible();
    expect(mocks.reportCheckoutConversionEvent).toHaveBeenCalledWith(
      'loja-teste',
      'public-token',
      'checkout_completed',
    );
    expect(mocks.reportCheckoutConversionEvent).toHaveBeenCalledWith(
      'loja-teste',
      'public-token',
      'pix_created',
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/storefront/loja-teste/orders/public-token/pix',
      expect.objectContaining({ method: 'POST', cache: 'no-store' }),
    );
  });
});

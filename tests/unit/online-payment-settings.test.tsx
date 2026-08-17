import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { OnlinePaymentSettings } from '@/features/stores/components/online-payment-settings';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/features/stores/payment-provider-actions', () => ({
  connectMercadoPagoAction: vi.fn(),
  disconnectMercadoPagoAction: vi.fn(),
  updateStorePaymentModeAction: vi.fn(),
}));

const baseCapability = {
  mode: 'MANUAL' as const,
  effectiveMode: 'MANUAL' as const,
  canSelectOnline: false,
  connection: null,
};

describe('OnlinePaymentSettings', () => {
  it('explica por que o modo Online está desabilitado', () => {
    render(
      <OnlinePaymentSettings
        storeId="store-1"
        expectedConfigurationVersion={1}
        readOnly={false}
        connectionFeedback={null}
        capability={baseCapability}
      />,
    );

    expect(screen.getByRole('radio', { name: /Pix automático/i })).toBeDisabled();
    expect(screen.getByText(/Conecte uma conta Mercado Pago para habilitar/i)).toBeVisible();
  });

  it('informa o fallback manual sem apagar a preferência Online', () => {
    render(
      <OnlinePaymentSettings
        storeId="store-1"
        expectedConfigurationVersion={2}
        readOnly={false}
        connectionFeedback={null}
        capability={{
          mode: 'ONLINE',
          effectiveMode: 'MANUAL',
          canSelectOnline: false,
          connection: {
            status: 'REAUTH_REQUIRED',
            liveMode: false,
            connectedAt: new Date(),
            refreshedAt: null,
            reauthRequiredAt: new Date(),
          },
        }}
      />,
    );

    expect(screen.getByText(/Pix automático continua salvo/i)).toBeVisible();
    expect(screen.getByText(/checkout usa o Pix manual/i)).toBeVisible();
  });

  it('mostra confirmação visível depois do callback OAuth', () => {
    render(
      <OnlinePaymentSettings
        storeId="store-1"
        expectedConfigurationVersion={3}
        readOnly={false}
        connectionFeedback="connected"
        capability={{
          mode: 'MANUAL',
          effectiveMode: 'MANUAL',
          canSelectOnline: true,
          connection: {
            status: 'ACTIVE',
            liveMode: false,
            connectedAt: new Date(),
            refreshedAt: null,
            reauthRequiredAt: null,
          },
        }}
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent('conectada com sucesso');
  });

  it('orienta usar vendedor de teste quando o ambiente não corresponde', () => {
    render(
      <OnlinePaymentSettings
        storeId="store-1"
        expectedConfigurationVersion={4}
        readOnly={false}
        connectionFeedback="environment_mismatch"
        capability={baseCapability}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('apenas uma conta Mercado Pago de teste');
    expect(screen.getByRole('alert')).toHaveTextContent('usuário de teste do tipo Vendedor');
  });

  it('diferencia conexão ativa de cobranças operacionais com falha', () => {
    render(
      <OnlinePaymentSettings
        storeId="store-1"
        expectedConfigurationVersion={5}
        readOnly={false}
        connectionFeedback={null}
        capability={{
          mode: 'ONLINE',
          effectiveMode: 'ONLINE',
          canSelectOnline: true,
          connection: {
            status: 'ACTIVE',
            liveMode: false,
            connectedAt: new Date(),
            refreshedAt: null,
            reauthRequiredAt: null,
          },
          paymentHealth: {
            status: 'DEGRADED',
            failedCharges: 2,
            lastFailureAt: new Date(),
          },
        }}
      />,
    );

    expect(screen.getByText('Cobranças com falha')).toBeVisible();
    expect(screen.getByRole('alert')).toHaveTextContent('2 cobranças recentes falharam');
    expect(screen.getByRole('alert')).toHaveTextContent('use o Pix manual');
  });
});

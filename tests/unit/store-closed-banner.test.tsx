import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { StoreClosedBanner } from '@/components/storefront/store-closed-banner';
import type { EffectiveStoreAvailability } from '@/features/stores/availability';

function availability(
  state: EffectiveStoreAvailability['state'],
  reason: string,
): EffectiveStoreAvailability {
  return {
    acceptingOrders: false,
    state,
    reason,
    nextTransitionAt: null,
  };
}

describe('StoreClosedBanner', () => {
  it('não renderiza quando a loja está aberta', () => {
    const { container } = render(
      <StoreClosedBanner
        availability={{
          acceptingOrders: true,
          state: 'OPEN',
          reason: 'Aberta agora.',
          nextTransitionAt: null,
        }}
      />,
    );

    expect(container.firstChild).toBeNull();
  });

  it('renderiza título e motivo para loja fechada pelo horário', () => {
    render(
      <StoreClosedBanner
        availability={availability(
          'CLOSED_BY_SCHEDULE',
          'Fechada agora pelo horário. Abre amanhã às 18:00.',
        )}
      />,
    );

    expect(screen.getByRole('status')).toHaveClass('storefront-closed-banner-info');
    expect(screen.getByText('Fechada agora')).toBeVisible();
    expect(screen.getByText('Fechada agora pelo horário. Abre amanhã às 18:00.')).toBeVisible();
  });

  it('renderiza aviso para pedidos pausados', () => {
    render(
      <StoreClosedBanner
        availability={availability('PAUSED', 'Os pedidos estão pausados temporariamente.')}
      />,
    );

    expect(screen.getByRole('status')).toHaveClass('storefront-closed-banner-warning');
    expect(screen.getByText('Pedidos pausados')).toBeVisible();
  });

  it('renderiza aviso para fechamento manual', () => {
    render(
      <StoreClosedBanner
        availability={availability('MANUALLY_CLOSED', 'A loja está fechada manualmente.')}
      />,
    );

    expect(screen.getByRole('status')).toHaveClass('storefront-closed-banner-warning');
    expect(screen.getByText('Fechada agora')).toBeVisible();
  });

  it('renderiza aviso para tenant ou loja inativa', () => {
    render(
      <StoreClosedBanner
        availability={availability(
          'TENANT_SUSPENDED',
          'Este estabelecimento está temporariamente indisponível.',
        )}
      />,
    );

    expect(screen.getByRole('status')).toHaveClass('storefront-closed-banner-warning');
    expect(screen.getByText('Temporariamente indisponível')).toBeVisible();
  });

  it('renderiza tom informativo para loja não pronta', () => {
    render(
      <StoreClosedBanner
        availability={availability(
          'NOT_READY',
          'A loja ainda não está pronta para receber pedidos.',
        )}
      />,
    );

    expect(screen.getByRole('status')).toHaveClass('storefront-closed-banner-info');
    expect(screen.getByText('Em preparação')).toBeVisible();
  });
});

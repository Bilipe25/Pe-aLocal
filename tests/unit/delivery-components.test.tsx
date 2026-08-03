import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DeliveryZonesManager } from '@/features/delivery/components/delivery-zones-manager';

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  deleteDeliveryZoneAction: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/features/delivery/actions', () => ({
  createDeliveryZoneAction: vi.fn(),
  updateDeliveryZoneAction: vi.fn(),
  deleteDeliveryZoneAction: mocks.deleteDeliveryZoneAction,
}));

const zones = [
  {
    id: 'zone-a',
    name: 'Centro e bairros próximos com um nome longo',
    fee: 500,
    minOrderValue: null,
    estimatedTime: '30–40 min',
    isActive: true,
    sortOrder: 0,
    updatedAt: '2026-07-28T12:00:00.000Z',
    postalRanges: [
      {
        id: 'range-a',
        postalCodeStart: '01000000',
        postalCodeEnd: '01099999',
      },
    ],
  },
];

describe('gestão de regiões de entrega', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
  });

  it('resume a integração com o checkout e mantém os detalhes progressivos', () => {
    render(
      <DeliveryZonesManager
        zones={zones}
        canEdit
        deliveryEnabled
        operationSettingsHref="/dashboard/stores/store-a/operations"
      />,
    );

    expect(screen.getByText('Disponível no checkout')).toBeInTheDocument();
    expect(screen.getByText('1 de 1')).toBeInTheDocument();
    expect(screen.getAllByText('R$ 5,00')).toHaveLength(2);
    expect(screen.getByText('Mínimo geral')).toBeInTheDocument();
    const coverageDisclosure = screen.getByText('1 faixa de CEP').closest('details');
    expect(coverageDisclosure).not.toHaveAttribute('open');

    fireEvent.click(screen.getByText('1 faixa de CEP'));

    expect(coverageDisclosure).toHaveAttribute('open');
    expect(screen.getByText(/01000-000/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Editar região Centro/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Excluir região Centro/ })).toBeInTheDocument();
  });

  it('abre um editor isolado em vez de expandir o formulário dentro do card', () => {
    render(
      <DeliveryZonesManager
        zones={zones}
        canEdit
        deliveryEnabled
        operationSettingsHref="/dashboard/stores/store-a/operations"
      />,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Editar região Centro/ }));

    expect(screen.getByRole('dialog', { name: /Editar Centro/ })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Bairro ou região' })).toHaveValue(zones[0].name);
    expect(screen.getByRole('button', { name: 'Salvar alterações' })).toBeInTheDocument();
  });

  it('mantém manager em leitura e explica quando a entrega está desativada', () => {
    render(
      <DeliveryZonesManager
        zones={zones}
        canEdit={false}
        deliveryEnabled={false}
        operationSettingsHref="/dashboard/stores/store-a/operations"
      />,
    );

    expect(screen.getByText('Entrega desativada')).toBeInTheDocument();
    expect(screen.getByText(/Somente o proprietário pode alterar/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nova região' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Editar região/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Excluir região/ })).not.toBeInTheDocument();
  });
});

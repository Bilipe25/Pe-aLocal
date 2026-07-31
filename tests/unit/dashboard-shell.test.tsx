import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect } from 'react';

import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import {
  DashboardOperationsProvider,
  useDashboardOperations,
} from '@/components/dashboard/dashboard-operations-context';

const mocks = vi.hoisted(() => ({
  pathname: '/dashboard/orders',
}));

vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
}));

vi.mock('@/features/stores/actions', () => ({
  selectStoreAction: vi.fn(),
}));

const store = {
  id: '00000000-0000-0000-0000-000000000001',
  name: 'Burger do Zé — Centro',
  slug: 'burger-do-ze',
  status: 'OPEN' as const,
  isActive: true,
};

function renderShell() {
  return render(
    <DashboardShell
      userName="Rafael Lima"
      tenantRole="OWNER"
      stores={[store]}
      activeStore={store}
      activeStoreTimeZone="America/Fortaleza"
      initialNowIso="2026-07-31T14:30:00.000Z"
      canViewCoupons
    >
      <p>Conteúdo operacional</p>
    </DashboardShell>,
  );
}

function RegisteredShell({
  onRefresh,
  onToggleSound,
  onOpenLatestOrder,
}: {
  onRefresh: () => void;
  onToggleSound: () => void;
  onOpenLatestOrder: () => void;
}) {
  const { register } = useDashboardOperations();
  useEffect(() => {
    register({
      realtimeState: 'degraded',
      recentOrderCount: 2,
      isRefreshing: false,
      soundEnabled: false,
      soundActivating: false,
      onRefresh,
      onToggleSound,
      onOpenLatestOrder,
    });
  }, [onOpenLatestOrder, onRefresh, onToggleSound, register]);

  return (
    <DashboardShell
      userName="Rafael Lima"
      tenantRole="OWNER"
      stores={[store]}
      activeStore={store}
      activeStoreTimeZone="America/Fortaleza"
      initialNowIso="2026-07-31T14:30:00.000Z"
      canViewCoupons
    >
      <p>Conteúdo operacional</p>
    </DashboardShell>
  );
}

describe('shell operacional do painel do tenant', () => {
  beforeEach(() => {
    mocks.pathname = '/dashboard/orders';
    vi.clearAllMocks();
  });

  it('expõe somente a navegação real e identifica a Central de pedidos', () => {
    renderShell();

    expect(screen.getAllByRole('link', { name: 'Central de pedidos' })).toHaveLength(1);
    expect(
      screen
        .getAllByRole('link', { name: 'Central de pedidos' })
        .every((link) => link.getAttribute('aria-current') === 'page'),
    ).toBe(true);
    expect(screen.queryByRole('link', { name: 'Clientes' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Relatórios' })).not.toBeInTheDocument();
  });

  it('mantem a Central em fluxo natural com a sidebar fixa', () => {
    const { container, rerender } = renderShell();
    expect(container.querySelector('main')).not.toHaveClass('max-w-7xl');
    expect(container.querySelector('.dashboard-shell')).not.toHaveClass('xl:fixed');
    expect(container.querySelector('main')).not.toHaveClass('xl:overflow-hidden');
    expect(container.querySelector('main')).not.toHaveClass('xl:overflow-clip');
    expect(container.querySelector('aside')).toHaveClass('sticky', 'top-0', 'h-dvh');

    mocks.pathname = '/dashboard/catalog';
    rerender(
      <DashboardShell
        userName="Rafael Lima"
        tenantRole="OWNER"
        stores={[store]}
        activeStore={store}
        activeStoreTimeZone="America/Fortaleza"
        initialNowIso="2026-07-31T14:30:00.000Z"
      >
        <p>Catálogo</p>
      </DashboardShell>,
    );

    expect(container.querySelector('main')).toHaveClass('max-w-7xl');
    expect(container.querySelector('.dashboard-shell')).not.toHaveClass('xl:fixed');
    expect(container.querySelector('main')).not.toHaveClass('xl:overflow-clip');
  });

  it('mostra iniciais e o papel real em um menu de conta acessível', () => {
    renderShell();

    const accountTrigger = screen.getByRole('button', {
      name: 'Abrir menu da conta de Rafael Lima, Proprietário',
    });
    expect(accountTrigger).not.toHaveAttribute('aria-haspopup');
    expect(screen.getByText('RL')).toBeInTheDocument();

    fireEvent.click(accountTrigger);
    expect(screen.getByRole('group', { name: 'Ações da conta' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sair da conta' })).toHaveFocus();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('group', { name: 'Ações da conta' })).not.toBeInTheDocument();
    expect(accountTrigger).toHaveFocus();
  });

  it('mantém som, atualização e pedido recente disponíveis no menu responsivo', async () => {
    const onRefresh = vi.fn();
    const onToggleSound = vi.fn();
    const onOpenLatestOrder = vi.fn();
    render(
      <DashboardOperationsProvider>
        <RegisteredShell
          onRefresh={onRefresh}
          onToggleSound={onToggleSound}
          onOpenLatestOrder={onOpenLatestOrder}
        />
      </DashboardOperationsProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Abrir menu do painel' }));
    expect(
      await screen.findByRole('region', { name: 'Controles operacionais dos pedidos' }),
    ).toHaveTextContent('Conexão degradada');

    const soundButton = screen.getByRole('button', { name: 'Ativar som' });
    await waitFor(() => expect(soundButton).toBeEnabled());
    fireEvent.click(soundButton);
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Abrir pedido mais recente' }));

    expect(onToggleSound).toHaveBeenCalledOnce();
    expect(onRefresh).toHaveBeenCalledOnce();
    expect(onOpenLatestOrder).toHaveBeenCalledOnce();
  });

  it('informa a data e a hora no fuso ativo da loja', () => {
    renderShell();

    expect(screen.getByLabelText(/Data e hora da loja:/)).toHaveTextContent('31 de jul de 2026');
    expect(screen.getByLabelText(/Data e hora da loja:/)).toHaveTextContent('11:30');
  });
});

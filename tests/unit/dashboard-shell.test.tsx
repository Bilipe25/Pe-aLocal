import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
  onOpenFilters,
}: {
  onRefresh: () => void;
  onToggleSound: () => void;
  onOpenLatestOrder: () => void;
  onOpenFilters: () => void;
}) {
  const { register, search } = useDashboardOperations();
  useEffect(() => {
    register({
      realtimeState: 'degraded',
      recentOrderCount: 2,
      activeFilterCount: 2,
      filtersOpen: false,
      isRefreshing: false,
      soundEnabled: false,
      soundActivating: false,
      onRefresh,
      onToggleSound,
      onOpenLatestOrder,
      onOpenFilters,
    });
  }, [onOpenFilters, onOpenLatestOrder, onRefresh, onToggleSound, register]);

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
      <output data-testid="dashboard-search-value">{search}</output>
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

  it('expõe a Cozinha somente quando a loja possui o entitlement', () => {
    const { rerender } = render(
      <DashboardShell
        userName="Rafael Lima"
        tenantRole="OWNER"
        stores={[store]}
        activeStore={store}
        activeStoreTimeZone="America/Fortaleza"
        initialNowIso="2026-07-31T14:30:00.000Z"
      >
        <p>Painel</p>
      </DashboardShell>,
    );
    expect(screen.queryByRole('link', { name: 'Cozinha' })).not.toBeInTheDocument();

    rerender(
      <DashboardShell
        userName="Rafael Lima"
        tenantRole="OWNER"
        stores={[store]}
        activeStore={store}
        activeStoreTimeZone="America/Fortaleza"
        initialNowIso="2026-07-31T14:30:00.000Z"
        canViewKds
      >
        <p>Painel</p>
      </DashboardShell>,
    );
    expect(screen.getAllByRole('link', { name: 'Cozinha' })).toHaveLength(1);
  });

  it('remove o chrome administrativo dentro da estação da cozinha', () => {
    mocks.pathname = '/dashboard/kds';
    const { container } = render(
      <DashboardShell
        userName="Rafael Lima"
        tenantRole="OWNER"
        stores={[store]}
        activeStore={store}
        activeStoreTimeZone="America/Fortaleza"
        initialNowIso="2026-07-31T14:30:00.000Z"
        canViewKds
      >
        <p>Tela operacional do KDS</p>
      </DashboardShell>,
    );

    expect(container.querySelector('.kds-dashboard-shell')).toBeInTheDocument();
    expect(container.querySelector('aside')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Abrir menu do painel' })).not.toBeInTheDocument();
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
    const onOpenFilters = vi.fn();
    render(
      <DashboardOperationsProvider>
        <RegisteredShell
          onRefresh={onRefresh}
          onToggleSound={onToggleSound}
          onOpenLatestOrder={onOpenLatestOrder}
          onOpenFilters={onOpenFilters}
        />
      </DashboardOperationsProvider>,
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Abrir filtros avançados, 2 filtros ativos' }),
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
    expect(onOpenFilters).toHaveBeenCalledOnce();
  });

  it('abre a busca pela topbar compacta e compartilha o estado sem manter o campo na página', async () => {
    render(
      <DashboardOperationsProvider>
        <RegisteredShell
          onRefresh={vi.fn()}
          onToggleSound={vi.fn()}
          onOpenLatestOrder={vi.fn()}
          onOpenFilters={vi.fn()}
        />
      </DashboardOperationsProvider>,
    );

    const trigger = screen.getByRole('button', { name: 'Buscar pedidos' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(document.querySelectorAll('input[type="search"]')).toHaveLength(1);

    fireEvent.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'Buscar pedidos' });
    const input = within(dialog).getByRole('searchbox', { name: 'Buscar pedidos' });
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(dialog).toHaveAttribute('id', trigger.getAttribute('aria-controls'));
    expect(input).toHaveFocus();
    expect(document.querySelectorAll('input[type="search"]')).toHaveLength(2);

    fireEvent.change(input, { target: { value: 'Mariana' } });
    expect(screen.getByTestId('dashboard-search-value')).toHaveTextContent('Mariana');
    expect(document.getElementById('orders-desktop-search-input')).toHaveValue('Mariana');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Limpar busca' }));
    expect(input).toHaveValue('');
    expect(input).toHaveFocus();

    fireEvent.change(input, { target: { value: 'Pedido 42' } });
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Buscar pedidos' })).not.toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Abrir busca, busca ativa' })).toHaveFocus();
    expect(screen.getByTestId('dashboard-search-value')).toHaveTextContent('Pedido 42');
  });

  it('informa a data e a hora no fuso ativo da loja', () => {
    renderShell();

    expect(screen.getByLabelText(/Data e hora da loja:/)).toHaveTextContent('31 de jul de 2026');
    expect(screen.getByLabelText(/Data e hora da loja:/)).toHaveTextContent('11:30');
  });

  it('mantém os alertas da loja disponíveis globalmente no desktop e no menu mobile', async () => {
    render(
      <DashboardShell
        userName="Rafael Lima"
        tenantRole="OWNER"
        stores={[store]}
        activeStore={store}
        activeStoreTimeZone="America/Fortaleza"
        initialNowIso="2026-07-31T14:30:00.000Z"
        merchantPush={{
          publicVapidKey: 'vapid-public-key',
          storeId: store.id,
          storeName: store.name,
        }}
      >
        <p>Catálogo</p>
      </DashboardShell>,
    );

    fireEvent.click(screen.getByRole('button', { name: /Alertas de pedidos/ }));
    expect(
      screen.getByRole('region', { name: `Alertas de novos pedidos — ${store.name}` }),
    ).toHaveTextContent(`Loja: ${store.name}`);

    fireEvent.click(screen.getByRole('button', { name: 'Abrir menu do painel' }));
    expect(
      within(screen.getByRole('dialog', { name: 'Menu do painel' })).getByRole('button', {
        name: /Alertas de pedidos/,
      }),
    ).toBeInTheDocument();
  });
});

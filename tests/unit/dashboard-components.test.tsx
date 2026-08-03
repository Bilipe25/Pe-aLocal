import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { DashboardOverview } from '@/components/dashboard/dashboard-overview';
import { HoursForm } from '@/features/stores/components/hours-form';
import { ProductOptionGroupsEditor } from '@/features/catalog/components/product-option-groups-editor';
import { ProductSetupProgress } from '@/features/catalog/components/product-setup-progress';
import { PaymentSettingsForm } from '@/features/stores/components/payment-settings-form';
import { StoreSettingsForm } from '@/features/stores/components/store-settings-form';
import { StorefrontDisplaySettingsForm } from '@/features/stores/components/storefront-display-settings-form';
import { StoreReadinessChecklist } from '@/features/stores/components/store-readiness-checklist';

const mocks = vi.hoisted(() => ({
  pathname: '/dashboard/catalog',
  refresh: vi.fn(),
  removePixConfigurationAction: vi.fn(),
  updateStorePaymentSettingsAction: vi.fn(),
  updateStorefrontDisplaySettingsAction: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ refresh: mocks.refresh, push: vi.fn() }),
}));

vi.mock('@/features/stores/actions', () => ({
  selectStoreAction: vi.fn(),
  removePixConfigurationAction: mocks.removePixConfigurationAction,
  updateHoursAction: vi.fn(),
  updateStorePaymentSettingsAction: mocks.updateStorePaymentSettingsAction,
  updateStoreSettingsAction: vi.fn(),
  updateStorefrontDisplaySettingsAction: mocks.updateStorefrontDisplaySettingsAction,
}));

vi.mock('@/features/catalog/actions', () => ({
  createOptionAction: vi.fn(),
  createOptionGroupAction: vi.fn(),
  deleteOptionAction: vi.fn(),
  deleteOptionGroupAction: vi.fn(),
  updateOptionAction: vi.fn(),
  updateOptionGroupAction: vi.fn(),
  moveCategoryAction: vi.fn(),
  moveProductAction: vi.fn(),
  moveOptionAction: vi.fn(),
  moveOptionGroupAction: vi.fn(),
}));

describe('componentes do painel do tenant', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
        unobserve() {}
      },
    );
  });

  it('expõe navegação persistente e estado atual', () => {
    render(
      <DashboardShell
        userName="Dono da loja"
        tenantRole="OWNER"
        activeStoreTimeZone="America/Fortaleza"
        initialNowIso="2026-07-31T14:30:00.000Z"
        stores={[
          {
            id: '00000000-0000-0000-0000-000000000001',
            name: 'Loja teste',
            slug: 'loja-teste',
            status: 'OPEN',
            isActive: true,
          },
        ]}
        activeStore={{
          id: '00000000-0000-0000-0000-000000000001',
          name: 'Loja teste',
          slug: 'loja-teste',
          status: 'OPEN',
          isActive: true,
        }}
      >
        <p>Conteúdo</p>
      </DashboardShell>,
    );

    const currentLinks = screen.getAllByRole('link', { name: 'Catálogo' });
    expect(currentLinks.some((link) => link.getAttribute('aria-current') === 'page')).toBe(true);
    expect(screen.getByText('Conteúdo')).toBeInTheDocument();
  });

  it('prioriza operação, resultado do dia e preparação da loja na visão geral', () => {
    render(
      <DashboardOverview
        store={{ id: 'store-a', name: 'Loja A', slug: 'loja-a' }}
        summary={{
          categoryCount: 3,
          productCount: 12,
          deliveryZoneCount: 2,
          activeHourCount: 7,
          hasAddress: true,
        }}
        readiness={{ isReady: true, blockers: [], warnings: [], issues: [] }}
        availability={{
          acceptingOrders: true,
          state: 'OPEN',
          reason: 'Aberta agora. Fecha às 23:00.',
          nextTransitionAt: null,
        }}
        orderCounts={{ total: 8, pending: 4, preparing: 3, ready: 1 }}
        dailyMetrics={{
          financialMetricsVisible: true,
          orderCount: 14,
          activeCount: 8,
          completedCount: 6,
          cancelledCount: 0,
          grossSales: 134_900,
          paidRevenue: 102_000,
          pendingRevenue: 32_900,
          averageTicket: 9_636,
          pendingPaymentCount: 2,
          averageAcceptanceMinutes: 5,
          averagePreparationMinutes: 22,
        }}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Operação agora' })).toBeInTheDocument();
    expect(screen.getByText('8 pedidos exigem acompanhamento.')).toBeInTheDocument();
    expect(screen.getByText('R$ 1.349,00')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Resultado de hoje' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Pronta para vender' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Abrir central/ })).toHaveAttribute(
      'href',
      '/dashboard/orders',
    );
  });

  it('mantém a visão geral útil quando pedidos e métricas estão indisponíveis', () => {
    render(
      <DashboardOverview
        store={{ id: 'store-a', name: 'Loja A', slug: 'loja-a' }}
        summary={{
          categoryCount: 0,
          productCount: 0,
          deliveryZoneCount: 0,
          activeHourCount: 0,
          hasAddress: false,
        }}
        readiness={{
          isReady: false,
          blockers: [
            {
              code: 'CATALOG_REQUIRED',
              severity: 'BLOCKER',
              title: 'Cardápio incompleto',
              description: 'Cadastre um produto.',
              actionHref: '/dashboard/catalog',
            },
          ],
          warnings: [],
          issues: [
            {
              code: 'CATALOG_REQUIRED',
              severity: 'BLOCKER',
              title: 'Cardápio incompleto',
              description: 'Cadastre um produto.',
              actionHref: '/dashboard/catalog',
            },
          ],
        }}
        availability={{
          acceptingOrders: false,
          state: 'NOT_READY',
          reason: 'A loja ainda não está pronta para receber pedidos.',
          nextTransitionAt: null,
        }}
      />,
    );

    expect(
      screen.getByText('Não foi possível atualizar a fila neste momento.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/O resumo de hoje está temporariamente indisponível/),
    ).toBeInTheDocument();
    expect(screen.getByText('1 bloqueador exige correção.')).toBeInTheDocument();
    expect(screen.getByText('Revisar')).toBeInTheDocument();
  });

  it('compacta dias fechados e expõe horários somente quando ativos', () => {
    render(
      <HoursForm
        storeId="00000000-0000-0000-0000-000000000001"
        expectedConfigurationVersion={0}
        timeZone="America/Fortaleza"
        canEditTimeZone
        exceptions={[]}
        availability={{ reason: 'Aberta agora.', nextTransitionAt: null }}
        hours={[
          {
            dayOfWeek: 'MONDAY',
            openTime: '11:00',
            closeTime: '23:00',
            isActive: true,
          },
        ]}
      />,
    );

    expect(screen.getByRole('switch', { name: 'Segunda-feira' })).toBeInTheDocument();
    expect(screen.getByLabelText('Abertura de Segunda-feira')).toBeInTheDocument();
    expect(screen.getByLabelText('Fechamento de Segunda-feira')).toBeInTheDocument();
    expect(screen.getAllByText('Fechado')).toHaveLength(12);

    fireEvent.click(screen.getByRole('switch', { name: 'Terça-feira' }));
    expect(screen.getByLabelText('Abertura de Terça-feira')).toBeInTheDocument();
    expect(screen.getByLabelText('Fechamento de Terça-feira')).toBeInTheDocument();
  });

  it('mostra bloqueadores de prontidão com atalho direto para correção', () => {
    render(
      <StoreReadinessChecklist
        readiness={{
          isReady: false,
          blockers: [
            {
              code: 'DELIVERY_ZONE_REQUIRED',
              severity: 'BLOCKER',
              title: 'Entrega sem zona ativa',
              description: 'Cadastre ao menos uma zona ativa.',
              actionHref: '/dashboard/delivery',
            },
          ],
          warnings: [],
          issues: [
            {
              code: 'DELIVERY_ZONE_REQUIRED',
              severity: 'BLOCKER',
              title: 'Entrega sem zona ativa',
              description: 'Cadastre ao menos uma zona ativa.',
              actionHref: '/dashboard/delivery',
            },
          ],
        }}
      />,
    );

    expect(screen.getByRole('heading', { name: '1 pendência antes de abrir' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Corrigir/ })).toHaveAttribute(
      'href',
      '/dashboard/delivery',
    );
  });

  it('mantém o fluxo de produto em duas etapas reais', () => {
    render(<ProductSetupProgress currentStep={2} />);

    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.queryByText('Revisar')).not.toBeInTheDocument();
    expect(screen.getByText('Adicionais').closest('li')).toHaveAttribute('aria-current', 'step');
  });

  it('preserva a hierarquia de seções nas configurações da loja', () => {
    render(
      <StoreSettingsForm
        storeId="00000000-0000-0000-0000-000000000001"
        storeStatus="CLOSED"
        expectedConfigurationVersion={0}
        settings={null}
        hasActiveDeliveryZone
        paymentSummary={{
          acceptsPix: true,
          acceptsCash: true,
          acceptsCardOnDelivery: true,
          pixConfigured: true,
        }}
        paymentsHref="/dashboard/stores/00000000-0000-0000-0000-000000000001/payments"
      />,
    );

    expect(
      screen.getByRole('heading', { level: 2, name: 'Como os pedidos são recebidos' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Regras do pedido' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Pagamentos' })).toBeInTheDocument();
  });

  it('apresenta operações sem controles de salvamento no modo somente leitura', () => {
    render(
      <StoreSettingsForm
        storeId="00000000-0000-0000-0000-000000000001"
        storeStatus="CLOSED"
        expectedConfigurationVersion={0}
        settings={null}
        hasActiveDeliveryZone
        paymentSummary={{
          acceptsPix: true,
          acceptsCash: true,
          acceptsCardOnDelivery: true,
          pixConfigured: true,
        }}
        paymentsHref={null}
        readOnly
      />,
    );

    expect(screen.queryByRole('button', { name: 'Salvar alterações' })).not.toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Entrega' })).toBeDisabled();
  });

  it('mostra apenas a chave Pix mascarada e exige substituição explícita', () => {
    render(
      <PaymentSettingsForm
        storeId="00000000-0000-0000-0000-000000000001"
        expectedConfigurationVersion={3}
        settings={{
          acceptsPix: true,
          acceptsCash: true,
          acceptsCardOnDelivery: false,
          pixKeyType: 'EMAIL',
          pixKeyMasked: 'fi***@example.com',
          hasPixKey: true,
          hasValidPixConfiguration: true,
          pixRecipient: 'PedidoLocal',
          pixBank: 'Banco Teste',
          pixInstructions: null,
        }}
      />,
    );

    expect(screen.getByText(/fi\*\*\*@example\.com/)).toBeInTheDocument();
    expect(screen.queryByDisplayValue('financeiro@example.com')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Nova chave Pix')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Substituir chave' }));

    expect(screen.getByLabelText('Nova chave Pix')).toHaveAttribute('type', 'password');
    expect(screen.getByRole('button', { name: 'Salvar pagamentos' })).toBeEnabled();
  });

  it('mantém preferências da vitrine independentes, restauráveis e somente leitura para manager', () => {
    const settings = {
      showEstimatedTimeInHero: true,
      showFulfillmentInHero: false,
      showMinOrderValueInHero: true,
      showOpeningHoursInHero: false,
      showFullAddressInStoreInfo: false,
      showRecentPurchasesSection: true,
      showFeaturedProductsSection: true,
    };
    const preview = {
      estimatedTime: '30–50 min',
      minOrderValue: 2000,
      fulfillment: 'Entrega · Retirada',
      hasOpeningHours: true,
      fullAddress: 'Rua A, 10 · Centro, Fortaleza - CE · CEP 60000-000',
    };
    const { rerender } = render(
      <StorefrontDisplaySettingsForm
        storeId="00000000-0000-0000-0000-000000000001"
        expectedConfigurationVersion={2}
        settings={settings}
        preview={preview}
      />,
    );

    const fulfillment = screen.getByRole('switch', { name: 'Entrega e retirada' });
    expect(fulfillment).not.toBeChecked();
    expect(
      screen.getByRole('switch', { name: 'Mostrar produtos comprados recentemente' }),
    ).toBeChecked();
    expect(screen.getByRole('switch', { name: 'Mostrar produtos em destaque' })).toBeChecked();
    fireEvent.click(
      screen.getByRole('switch', { name: 'Mostrar produtos comprados recentemente' }),
    );
    expect(
      screen.getByRole('switch', { name: 'Mostrar produtos comprados recentemente' }),
    ).not.toBeChecked();
    expect(screen.getByRole('switch', { name: 'Mostrar produtos em destaque' })).toBeChecked();
    fireEvent.click(fulfillment);
    expect(fulfillment).toBeChecked();
    expect(screen.getByRole('button', { name: 'Salvar exibição' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Restaurar valores salvos' }));
    expect(fulfillment).not.toBeChecked();

    rerender(
      <StorefrontDisplaySettingsForm
        storeId="00000000-0000-0000-0000-000000000001"
        expectedConfigurationVersion={2}
        settings={settings}
        preview={preview}
        readOnly
      />,
    );
    expect(screen.getByRole('switch', { name: 'Prazo estimado' })).toBeDisabled();
    expect(
      screen.getByRole('switch', { name: 'Mostrar produtos comprados recentemente' }),
    ).toBeDisabled();
    expect(screen.getByRole('switch', { name: 'Mostrar produtos em destaque' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Salvar exibição' })).not.toBeInTheDocument();
  });

  it('apresenta grupos e opções existentes do produto', () => {
    render(
      <ProductOptionGroupsEditor
        productId="00000000-0000-0000-0002-000000000001"
        groups={[
          {
            id: 'group-1',
            title: 'Adicionais',
            description: 'Escolha seus complementos',
            isRequired: false,
            isMultiple: true,
            minSelections: 0,
            maxSelections: 3,
            sortOrder: 0,
            isActive: true,
            options: [
              { id: 'option-1', name: 'Bacon extra', price: 400, isAvailable: true, sortOrder: 0 },
            ],
          },
        ]}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Grupos de adicionais' })).toBeInTheDocument();
    expect(screen.getByText('Bacon extra')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Novo grupo' }));
    expect(screen.getByRole('button', { name: 'Criar grupo' })).toBeInTheDocument();
  });
});

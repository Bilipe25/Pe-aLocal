import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { HoursForm } from '@/features/stores/components/hours-form';
import { ProductOptionGroupsEditor } from '@/features/catalog/components/product-option-groups-editor';
import { ProductSetupProgress } from '@/features/catalog/components/product-setup-progress';
import { StoreSettingsForm } from '@/features/stores/components/store-settings-form';
import { StoreReadinessChecklist } from '@/features/stores/components/store-readiness-checklist';

const mocks = vi.hoisted(() => ({
  pathname: '/dashboard/catalog',
  refresh: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ refresh: mocks.refresh, push: vi.fn() }),
}));

vi.mock('@/features/stores/actions', () => ({
  selectStoreAction: vi.fn(),
  updateHoursAction: vi.fn(),
  updateStoreSettingsAction: vi.fn(),
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

  it('compacta dias fechados e expõe horários somente quando ativos', () => {
    render(
      <HoursForm
        storeId="00000000-0000-0000-0000-000000000001"
        expectedConfigurationVersion={0}
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
        expectedConfigurationVersion={0}
        settings={null}
      />,
    );

    expect(screen.getByRole('heading', { level: 2, name: 'Modalidades' })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Formas de pagamento' }),
    ).toBeInTheDocument();
  });

  it('apresenta operações sem controles de salvamento no modo somente leitura', () => {
    render(
      <StoreSettingsForm
        storeId="00000000-0000-0000-0000-000000000001"
        expectedConfigurationVersion={0}
        settings={null}
        readOnly
      />,
    );

    expect(screen.queryByRole('button', { name: 'Salvar configurações' })).not.toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Entrega habilitada' })).toBeDisabled();
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

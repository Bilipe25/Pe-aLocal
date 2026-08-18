import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ReportsDashboard } from '@/features/reports/components/reports-dashboard';
import type { AdvancedReportsDTO } from '@/types/reports';

const mocks = vi.hoisted(() => ({
  getAdvancedReportsAction: vi.fn(),
}));

vi.mock('@/features/reports/actions', () => ({
  getAdvancedReportsAction: mocks.getAdvancedReportsAction,
}));

function reportData(overrides: Partial<AdvancedReportsDTO> = {}): AdvancedReportsDTO {
  return {
    period: {
      preset: 'LAST_7_DAYS',
      label: '12–18 de ago de 2026',
      comparisonLabel: '05–11 de ago de 2026',
      startLocalDate: '2026-08-12',
      endLocalDate: '2026-08-18',
      timeZone: 'America/Fortaleza',
      granularity: 'DAY',
    },
    summary: {
      completedValueCents: 842050,
      operationalOrders: 186,
      completedPaidOrders: 172,
      averageTicketCents: 4896,
      cancelledOrders: 7,
      cancelledRatePercent: 3.8,
      comparisons: {
        completedValue: {
          direction: 'UP',
          changePercent: 12,
          label: '12% acima do período anterior',
        },
        operationalOrders: {
          direction: 'UP',
          changePercent: 8,
          label: '8% acima do período anterior',
        },
        averageTicket: { direction: 'STABLE', changePercent: 0, label: 'Sem mudança relevante' },
        cancelledOrders: {
          direction: 'DOWN',
          changePercent: -2,
          label: '2% abaixo do período anterior',
        },
      },
    },
    series: [
      {
        key: '2026-08-12',
        label: 'qua',
        fullLabel: 'quarta-feira, 12 de agosto',
        orderCount: 22,
        completedValueCents: 98200,
      },
      {
        key: '2026-08-13',
        label: 'qui',
        fullLabel: 'quinta-feira, 13 de agosto',
        orderCount: 31,
        completedValueCents: 147500,
      },
      {
        key: '2026-08-14',
        label: 'sex',
        fullLabel: 'sexta-feira, 14 de agosto',
        orderCount: 42,
        completedValueCents: 191300,
      },
    ],
    products: [
      { productId: 'product-a', name: 'X-Bacon da Casa', quantity: 74 },
      { productId: 'product-b', name: 'Batata crocante', quantity: 58 },
    ],
    peakHour: { hour: 19, label: '19h–20h', orderCount: 42, sharePercent: 22.6 },
    operation: {
      averageAcceptanceSeconds: 132,
      acceptanceSampleSize: 168,
      averagePreparationSeconds: 1074,
      preparationSampleSize: 151,
      attentionAlertsCount: 9,
    },
    modalities: [
      { modality: 'DELIVERY', label: 'Entrega', orderCount: 121, sharePercent: 65.1 },
      { modality: 'PICKUP', label: 'Retirada', orderCount: 65, sharePercent: 34.9 },
    ],
    insights: [
      { id: 'PEAK_HOUR', text: '19h–20h foi o horário mais forte, com 42 pedidos.' },
      { id: 'TOP_PRODUCT', text: 'X-Bacon da Casa liderou as saídas, com 74 unidades.' },
    ],
    insightsMinimumSample: 5,
    hasEnoughDataForInsights: true,
    ...overrides,
  };
}

describe('interface dos relatórios avançados', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('apresenta a hierarquia aprovada, números coerentes e alternativa tabular ao gráfico', () => {
    render(<ReportsDashboard initialData={reportData()} />);

    expect(
      screen.getByRole('heading', { name: 'Entenda sua loja sem complicação' }),
    ).toBeInTheDocument();
    expect(screen.getByText('R$ 8.420,50')).toBeInTheDocument();
    expect(screen.getByText('R$ 48,96')).toBeInTheDocument();
    expect(screen.getByText('3,8% dos pedidos operacionais')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Destaques do período' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Movimento no período' })).toBeInTheDocument();
    expect(
      screen.getByRole('table', { name: 'Pedidos e valor concluído por intervalo' }),
    ).toBeInTheDocument();
    expect(screen.getByText('X-Bacon da Casa')).toBeInTheDocument();
    expect(screen.getByText('2min 12s')).toBeInTheDocument();
    expect(screen.getByText('17min 54s')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hoje' })).toHaveClass('min-h-11');
  });

  it('troca o período pela Server Action e atualiza o conteúdo', async () => {
    const today = reportData({
      period: {
        preset: 'TODAY',
        label: 'Hoje, até 12:34',
        comparisonLabel: 'Mesmo horário de ontem',
        startLocalDate: '2026-08-18',
        endLocalDate: '2026-08-18',
        timeZone: 'America/Fortaleza',
        granularity: 'HOUR',
      },
      summary: {
        ...reportData().summary,
        operationalOrders: 24,
      },
    });
    mocks.getAdvancedReportsAction.mockResolvedValue({ success: true, data: today });
    render(<ReportsDashboard initialData={reportData()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Hoje' }));

    await waitFor(() =>
      expect(mocks.getAdvancedReportsAction).toHaveBeenCalledWith({ preset: 'TODAY' }),
    );
    await waitFor(() => expect(screen.getByText('Hoje, até 12:34')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Hoje' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('mostra vazio, amostra insuficiente e erro sem expor estruturas incompletas', async () => {
    const empty = reportData({
      summary: {
        ...reportData().summary,
        operationalOrders: 0,
        completedPaidOrders: 0,
        completedValueCents: 0,
        averageTicketCents: 0,
        cancelledOrders: 0,
        cancelledRatePercent: 0,
      },
      insights: [],
      hasEnoughDataForInsights: false,
    });
    mocks.getAdvancedReportsAction.mockResolvedValue({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Não foi possível atualizar agora.' },
    });
    render(<ReportsDashboard initialData={empty} />);

    expect(
      screen.getByRole('heading', { name: 'Nenhum pedido neste período' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Movimento no período' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '30 dias' }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível atualizar agora.'),
    );
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toHaveClass('min-h-11');
  });

  it('explica por que não há destaques quando a amostra é insuficiente', () => {
    render(
      <ReportsDashboard
        initialData={reportData({ insights: [], hasEnoughDataForInsights: false })}
      />,
    );

    expect(
      screen.getByText(/São necessários pelo menos 5 pedidos operacionais/),
    ).toBeInTheDocument();
  });
});

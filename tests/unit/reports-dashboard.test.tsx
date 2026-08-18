import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ReportsDashboard } from '@/features/reports/components/reports-dashboard';
import type { AdvancedReportsDTO } from '@/types/reports';

const mocks = vi.hoisted(() => ({ getAdvancedReportsAction: vi.fn() }));

vi.mock('@/features/reports/actions', () => ({
  getAdvancedReportsAction: mocks.getAdvancedReportsAction,
}));

const noBase = {
  direction: 'NO_BASE',
  changePercent: null,
  label: 'Sem base anterior',
} as const;
const stableDuration = {
  direction: 'STABLE',
  changeSeconds: 0,
  changePercent: 0,
  label: 'Sem mudança relevante',
} as const;

function reportData(overrides: Partial<AdvancedReportsDTO> = {}): AdvancedReportsDTO {
  return {
    period: {
      preset: 'LAST_7_DAYS',
      label: '12–18 de ago de 2026',
      comparisonLabel: 'Mesmo intervalo imediatamente anterior',
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
          label: '12% acima do intervalo anterior',
        },
        operationalOrders: {
          direction: 'UP',
          changePercent: 8,
          label: '8% acima do intervalo anterior',
        },
        averageTicket: {
          direction: 'STABLE',
          changePercent: 0,
          label: 'Sem mudança relevante',
        },
        cancelledOrders: {
          direction: 'DOWN',
          changePercent: -2,
          label: '2% abaixo do intervalo anterior',
        },
      },
    },
    trend: {
      direction: 'GROWING',
      label: 'Tendência de crescimento',
      description: '8% acima do intervalo anterior. Histórico, não previsão.',
      sampleSize: 186,
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
    products: {
      top: [
        { productId: 'product-a', name: 'X-Bacon da Casa', quantity: 74 },
        { productId: 'product-b', name: 'Batata crocante', quantity: 58 },
      ],
      movements: [
        {
          productId: 'product-a',
          name: 'X-Bacon da Casa',
          currentQuantity: 74,
          previousQuantity: 50,
          direction: 'UP',
          changePercent: 48,
          label: '+48%',
        },
      ],
    },
    hours: {
      peak: {
        startHour: 19,
        endHour: 21,
        label: '19h–21h',
        orderCount: 42,
        sharePercent: 22.6,
      },
      quiet: {
        startHour: 15,
        endHour: 17,
        label: '15h–17h',
        orderCount: 8,
        sharePercent: 4.3,
      },
      strongestWeekday: null,
    },
    operation: {
      averageAcceptanceSeconds: 132,
      acceptanceSampleSize: 168,
      acceptanceComparison: stableDuration,
      averagePreparationSeconds: 1074,
      preparationSampleSize: 151,
      preparationComparison: {
        direction: 'SLOWER',
        changeSeconds: 174,
        changePercent: 19.3,
        label: '2 min 54 s mais lento',
      },
      bottleneck: {
        stage: 'PREPARATION',
        title: 'O principal aumento aconteceu no preparo.',
        description: 'Entre 19h–21h, a média chegou a 20 min.',
        currentAverageSeconds: 1074,
        previousAverageSeconds: 900,
        changeSeconds: 174,
        peakWindow: { label: '19h–21h', averageSeconds: 1200, sampleSize: 38 },
      },
      sla: { attentionOrders: 9, criticalOrders: 3, comparison: noBase },
    },
    modalities: [
      {
        modality: 'DELIVERY',
        label: 'Entrega',
        orderCount: 121,
        sharePercent: 65.1,
        completedPaidOrders: 110,
        averageTicketCents: 5182,
        cancelledOrders: 5,
        cancelledRatePercent: 4.1,
      },
      {
        modality: 'PICKUP',
        label: 'Retirada',
        orderCount: 65,
        sharePercent: 34.9,
        completedPaidOrders: 62,
        averageTicketCents: 4388,
        cancelledOrders: 2,
        cancelledRatePercent: 3.1,
      },
    ],
    insights: [
      {
        id: 'PREPARATION_BOTTLENECK',
        category: 'OPERATION',
        priority: 100,
        tone: 'ATTENTION',
        title: 'Preparo pede atenção',
        description: 'Ficou 2 min 54 s mais lento.',
        evidence: {
          metric: 'AVERAGE_PREPARATION_SECONDS',
          current: 1074,
          previous: 900,
          changePercent: 19.3,
          unit: 'SECONDS',
        },
        sampleSize: 38,
      },
      {
        id: 'PRODUCT_GROWTH',
        category: 'PRODUCT',
        priority: 60,
        tone: 'POSITIVE',
        title: 'Produto em alta',
        description: 'X-Bacon da Casa vendeu 74 unidades.',
        evidence: {
          metric: 'PRODUCT_QUANTITY',
          current: 74,
          previous: 50,
          changePercent: 48,
          unit: 'UNITS',
        },
        sampleSize: 124,
      },
    ],
    intelligenceState: 'READY',
    ...overrides,
  };
}

describe('interface dos relatórios avançados V2', () => {
  beforeEach(() => vi.clearAllMocks());

  it('apresenta a hierarquia aprovada, números coerentes e alternativa tabular ao gráfico', () => {
    render(<ReportsDashboard initialData={reportData()} />);

    expect(screen.getByRole('heading', { name: 'O que mudou na sua loja' })).toBeInTheDocument();
    expect(screen.getByText('R$ 8.420,50')).toBeInTheDocument();
    expect(screen.getByText('R$ 48,96')).toBeInTheDocument();
    expect(screen.getByText('3,8% dos pedidos')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Destaques do período' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Tendência e produtos' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Pedidos por intervalo' })).toBeInTheDocument();
    expect(screen.getAllByText('X-Bacon da Casa').length).toBeGreaterThan(0);
    expect(screen.getByText('2min 12s')).toBeInTheDocument();
    expect(screen.getByText('17min 54s')).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Comparação por modalidade' })).toBeInTheDocument();
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
      summary: { ...reportData().summary, operationalOrders: 24 },
    });
    mocks.getAdvancedReportsAction.mockResolvedValue({ success: true, data: today });
    render(<ReportsDashboard initialData={reportData()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Hoje' }));

    await waitFor(() =>
      expect(mocks.getAdvancedReportsAction).toHaveBeenCalledWith({ preset: 'TODAY' }),
    );
    await waitFor(() => expect(screen.getByText(/Hoje, até 12:34/)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Hoje' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('mostra vazio e erro sem expor estruturas incompletas', async () => {
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
      intelligenceState: 'INSUFFICIENT',
    });
    mocks.getAdvancedReportsAction.mockResolvedValue({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Não foi possível atualizar agora.' },
    });
    render(<ReportsDashboard initialData={empty} />);

    expect(
      screen.getByRole('heading', { name: 'Ainda estamos conhecendo sua operação' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Tendência e produtos' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '30 dias' }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível atualizar agora.'),
    );
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toHaveClass('min-h-11');
  });

  it('explica por que não há destaques quando a amostra é insuficiente', () => {
    render(
      <ReportsDashboard
        initialData={reportData({
          insights: [],
          intelligenceState: 'INSUFFICIENT',
          trend: {
            direction: 'INSUFFICIENT',
            label: 'Sem tendência comparável',
            description: 'Ainda não há base suficiente para comparar.',
            sampleSize: 3,
          },
        })}
      />,
    );

    expect(screen.getByText(/Ainda não há dados suficientes para comparar/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Operação' })).toBeInTheDocument();
    expect(screen.getByText('Sem tendência comparável')).toBeInTheDocument();
    expect(screen.getAllByText('X-Bacon da Casa').length).toBeGreaterThan(0);
  });

  it('mantém duração anômala visível em horas legíveis', () => {
    render(
      <ReportsDashboard
        initialData={reportData({
          operation: {
            ...reportData().operation,
            averageAcceptanceSeconds: 40309,
          },
        })}
      />,
    );

    expect(screen.getByText('11h 11min 49s')).toBeInTheDocument();
  });
});

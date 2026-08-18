import { describe, expect, it } from 'vitest';

import {
  ADVANCED_REPORT_THRESHOLDS,
  buildAdvancedReportInsights,
} from '@/domain/reports/advanced-report-insights';

const baseInput = {
  currentOperationalOrders: 100,
  previousOperationalOrders: 80,
  operationalOrdersChangePercent: 25,
  productMovements: [
    {
      productId: 'product-a',
      name: 'X-Bacon da Casa',
      currentQuantity: 30,
      previousQuantity: 20,
      direction: 'UP' as const,
      changePercent: 50,
      label: '+50%',
    },
  ],
  bottleneck: {
    stage: 'PREPARATION' as const,
    title: 'O principal aumento aconteceu no preparo.',
    description: 'A média ficou mais lenta.',
    currentAverageSeconds: 1200,
    previousAverageSeconds: 900,
    changeSeconds: 300,
    peakWindow: { label: '19h–21h', averageSeconds: 1320, sampleSize: 25 },
  },
  modalities: [
    {
      modality: 'DELIVERY' as const,
      label: 'Entrega',
      orderCount: 70,
      sharePercent: 70,
      completedPaidOrders: 65,
      averageTicketCents: 5000,
      cancelledOrders: 3,
      cancelledRatePercent: 4.3,
    },
  ],
  peakHour: {
    startHour: 19,
    endHour: 21,
    label: '19h–21h',
    orderCount: 30,
    sharePercent: 30,
  },
};

describe('motor determinístico de insights', () => {
  it('ordena por prioridade, limita a três e inclui evidência auditável', () => {
    const insights = buildAdvancedReportInsights(baseInput);

    expect(insights).toHaveLength(ADVANCED_REPORT_THRESHOLDS.maximumVisibleInsights);
    expect(insights.map((insight) => insight.id)).toEqual([
      'PREPARATION_BOTTLENECK',
      'COMMERCIAL_CHANGE',
      'PRODUCT_GROWTH',
    ]);
    expect(insights[0]).toMatchObject({
      category: 'OPERATION',
      evidence: {
        metric: 'AVERAGE_PREPARATION_SECONDS',
        current: 1200,
        previous: 900,
      },
      sampleSize: 25,
    });
  });

  it('não cria narrativa abaixo da amostra mínima', () => {
    expect(
      buildAdvancedReportInsights({
        ...baseInput,
        currentOperationalOrders: ADVANCED_REPORT_THRESHOLDS.minimumInsightOrders - 1,
      }),
    ).toEqual([]);
  });

  it('não trata comparação contra zero como crescimento percentual', () => {
    const insights = buildAdvancedReportInsights({
      ...baseInput,
      previousOperationalOrders: 0,
      operationalOrdersChangePercent: null,
      productMovements: [],
      bottleneck: null,
      modalities: [],
      peakHour: null,
    });

    expect(insights).toEqual([]);
  });
});

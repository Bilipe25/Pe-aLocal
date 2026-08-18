import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getAdvancedReports } from '@/server/services/reports.service';

const mocks = vi.hoisted(() => ({
  getReportsSummary: vi.fn(),
  getReportsSeries: vi.fn(),
  getReportsProductTrends: vi.fn(),
  getReportsHourDistribution: vi.fn(),
  getReportsWeekdayDistribution: vi.fn(),
  getReportsDurations: vi.fn(),
  getReportsDurationsByHour: vi.fn(),
  getReportsModalities: vi.fn(),
  getReportsSlaCounts: vi.fn(),
}));

vi.mock('@/server/repositories/reports.repository', () => mocks);

const context = {
  tenantId: 'tenant-a',
  storeId: 'store-a',
  timeZone: 'America/Fortaleza',
  operationalSlaEnabled: true,
};

describe('serviço agregado de relatórios V2', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getReportsSummary
      .mockResolvedValueOnce({
        operationalOrders: 186,
        cancelledOrders: 7,
        completedPaidOrders: 172,
        completedValueCents: BigInt(842050),
      })
      .mockResolvedValueOnce({
        operationalOrders: 160,
        cancelledOrders: 8,
        completedPaidOrders: 150,
        completedValueCents: BigInt(720000),
      });
    mocks.getReportsSeries.mockResolvedValue([
      { key: '2026-08-12', orderCount: 22, completedValueCents: BigInt(98200) },
      { key: '2026-08-13', orderCount: 31, completedValueCents: BigInt(147500) },
    ]);
    mocks.getReportsProductTrends.mockResolvedValue([
      {
        productId: 'product-a',
        name: 'X-Bacon da Casa',
        currentQuantity: 74,
        previousQuantity: 50,
      },
      {
        productId: 'product-b',
        name: 'Batata crocante',
        currentQuantity: 58,
        previousQuantity: 60,
      },
    ]);
    mocks.getReportsHourDistribution.mockResolvedValue([
      { hour: 11, orderCount: 12 },
      { hour: 19, orderCount: 42 },
      { hour: 20, orderCount: 22 },
      { hour: 21, orderCount: 10 },
    ]);
    mocks.getReportsWeekdayDistribution.mockResolvedValue([]);
    mocks.getReportsDurations
      .mockResolvedValueOnce({
        averageAcceptanceSeconds: 132,
        acceptanceSampleSize: 168,
        averagePreparationSeconds: 1074,
        preparationSampleSize: 151,
      })
      .mockResolvedValueOnce({
        averageAcceptanceSeconds: 150,
        acceptanceSampleSize: 140,
        averagePreparationSeconds: 900,
        preparationSampleSize: 130,
      });
    mocks.getReportsDurationsByHour.mockResolvedValue([
      {
        hour: 19,
        averageAcceptanceSeconds: 140,
        acceptanceSampleSize: 20,
        averagePreparationSeconds: 1280,
        preparationSampleSize: 20,
      },
      {
        hour: 20,
        averageAcceptanceSeconds: 125,
        acceptanceSampleSize: 18,
        averagePreparationSeconds: 1180,
        preparationSampleSize: 18,
      },
    ]);
    mocks.getReportsModalities.mockResolvedValue([
      {
        modality: 'DELIVERY',
        orderCount: 121,
        cancelledOrders: 5,
        completedPaidOrders: 110,
        completedValueCents: BigInt(570000),
      },
      {
        modality: 'PICKUP',
        orderCount: 65,
        cancelledOrders: 2,
        completedPaidOrders: 62,
        completedValueCents: BigInt(272050),
      },
    ]);
    mocks.getReportsSlaCounts
      .mockResolvedValueOnce({ attentionOrders: 9, criticalOrders: 3 })
      .mockResolvedValueOnce({ attentionOrders: 6, criticalOrders: 2 });
  });

  it('mantém a semântica comercial e gera inteligência determinística limitada a três itens', async () => {
    const result = await getAdvancedReports(
      context,
      { preset: 'LAST_7_DAYS' },
      new Date('2026-08-18T15:34:00.000Z'),
    );

    expect(result.summary).toMatchObject({
      completedValueCents: 842050,
      operationalOrders: 186,
      completedPaidOrders: 172,
      averageTicketCents: 4896,
      cancelledOrders: 7,
      cancelledRatePercent: 3.8,
    });
    expect(result.trend).toMatchObject({ direction: 'GROWING', sampleSize: 186 });
    expect(result.products.top[0]).toEqual({
      productId: 'product-a',
      name: 'X-Bacon da Casa',
      quantity: 74,
    });
    expect(result.products.movements[0]).toMatchObject({ direction: 'UP', changePercent: 48 });
    expect(result.hours.peak).toMatchObject({ label: '19h–21h', orderCount: 64 });
    expect(result.operation.bottleneck).toMatchObject({ stage: 'PREPARATION' });
    expect(result.operation.sla).toMatchObject({ attentionOrders: 9, criticalOrders: 3 });
    expect(result.insights.map((insight) => insight.id)).toEqual([
      'PREPARATION_BOTTLENECK',
      'COMMERCIAL_CHANGE',
      'PRODUCT_GROWTH',
    ]);
    expect(result.modalities[0]).toMatchObject({
      modality: 'DELIVERY',
      orderCount: 121,
      sharePercent: 65.1,
      averageTicketCents: 5182,
      cancelledRatePercent: 4.1,
    });
    expect(result.series).toHaveLength(7);
    expect(result.series[2]).toMatchObject({ key: '2026-08-14', orderCount: 0 });
    expect(JSON.stringify(result)).not.toMatch(/customer|phone|address|notes/i);
  });

  it('omite SLA desligado e não cria conclusões com amostra menor que cinco', async () => {
    mocks.getReportsSummary.mockReset();
    mocks.getReportsSummary
      .mockResolvedValueOnce({
        operationalOrders: 4,
        cancelledOrders: 0,
        completedPaidOrders: 3,
        completedValueCents: BigInt(12000),
      })
      .mockResolvedValueOnce({
        operationalOrders: 2,
        cancelledOrders: 0,
        completedPaidOrders: 2,
        completedValueCents: BigInt(8000),
      });

    const result = await getAdvancedReports(
      { ...context, operationalSlaEnabled: false },
      { preset: 'LAST_7_DAYS' },
      new Date('2026-08-18T15:34:00.000Z'),
    );

    expect(result.intelligenceState).toBe('INSUFFICIENT');
    expect(result.insights).toEqual([]);
    expect(result.operation.sla).toBeNull();
    expect(mocks.getReportsSlaCounts).not.toHaveBeenCalled();
  });

  it('filtra base pequena, reconhece produto novo e ordena altas e quedas relevantes', async () => {
    mocks.getReportsProductTrends.mockReset().mockResolvedValue([
      {
        productId: 'falling',
        name: 'Açaí 300 ml',
        currentQuantity: 5,
        previousQuantity: 10,
      },
      {
        productId: 'new',
        name: 'Batata G',
        currentQuantity: 5,
        previousQuantity: 0,
      },
      {
        productId: 'small-base',
        name: 'Porção pequena',
        currentQuantity: 2,
        previousQuantity: 1,
      },
    ]);

    const result = await getAdvancedReports(
      context,
      { preset: 'LAST_7_DAYS' },
      new Date('2026-08-18T15:34:00.000Z'),
    );

    expect(result.products.movements).toEqual([
      expect.objectContaining({ productId: 'falling', direction: 'DOWN', changePercent: -50 }),
      expect.objectContaining({ productId: 'new', direction: 'NEW', changePercent: null }),
    ]);
    expect(result.products.movements).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ productId: 'small-base' })]),
    );
  });

  it('mantém tendência e durações estáveis quando a mudança é apenas ruído', async () => {
    mocks.getReportsSummary.mockReset();
    mocks.getReportsSummary
      .mockResolvedValueOnce({
        operationalOrders: 100,
        cancelledOrders: 3,
        completedPaidOrders: 90,
        completedValueCents: BigInt(450000),
      })
      .mockResolvedValueOnce({
        operationalOrders: 98,
        cancelledOrders: 3,
        completedPaidOrders: 88,
        completedValueCents: BigInt(440000),
      });
    mocks.getReportsProductTrends.mockReset().mockResolvedValue([
      {
        productId: 'stable',
        name: 'X-Tudo',
        currentQuantity: 20,
        previousQuantity: 19,
      },
    ]);
    mocks.getReportsDurations.mockReset();
    mocks.getReportsDurations
      .mockResolvedValueOnce({
        averageAcceptanceSeconds: 120,
        acceptanceSampleSize: 90,
        averagePreparationSeconds: 900,
        preparationSampleSize: 80,
      })
      .mockResolvedValueOnce({
        averageAcceptanceSeconds: 120,
        acceptanceSampleSize: 85,
        averagePreparationSeconds: 900,
        preparationSampleSize: 75,
      });
    mocks.getReportsModalities.mockReset().mockResolvedValue([
      {
        modality: 'DELIVERY',
        orderCount: 60,
        cancelledOrders: 2,
        completedPaidOrders: 54,
        completedValueCents: BigInt(270000),
      },
      {
        modality: 'PICKUP',
        orderCount: 40,
        cancelledOrders: 1,
        completedPaidOrders: 36,
        completedValueCents: BigInt(180000),
      },
    ]);

    const result = await getAdvancedReports(
      context,
      { preset: 'LAST_7_DAYS' },
      new Date('2026-08-18T15:34:00.000Z'),
    );

    expect(result.trend.direction).toBe('STABLE');
    expect(result.products.movements).toEqual([]);
    expect(result.operation.acceptanceComparison.direction).toBe('STABLE');
    expect(result.operation.preparationComparison.direction).toBe('STABLE');
    expect(result.operation.bottleneck).toBeNull();
    expect(result.insights.map((insight) => insight.id)).not.toEqual(
      expect.arrayContaining(['COMMERCIAL_CHANGE', 'PRODUCT_GROWTH', 'PRODUCT_DECLINE']),
    );
  });

  it('descreve melhora no aceite sem criar gargalo artificial', async () => {
    mocks.getReportsDurations.mockReset();
    mocks.getReportsDurations
      .mockResolvedValueOnce({
        averageAcceptanceSeconds: 90,
        acceptanceSampleSize: 100,
        averagePreparationSeconds: 900,
        preparationSampleSize: 100,
      })
      .mockResolvedValueOnce({
        averageAcceptanceSeconds: 150,
        acceptanceSampleSize: 100,
        averagePreparationSeconds: 900,
        preparationSampleSize: 100,
      });

    const result = await getAdvancedReports(
      context,
      { preset: 'LAST_7_DAYS' },
      new Date('2026-08-18T15:34:00.000Z'),
    );

    expect(result.operation.acceptanceComparison).toMatchObject({
      direction: 'FASTER',
      changeSeconds: -60,
    });
    expect(result.operation.bottleneck).toBeNull();
  });

  it('resolve empate horário de forma estável e só calcula dia forte em período longo', async () => {
    mocks.getReportsHourDistribution.mockReset().mockResolvedValue([
      { hour: 18, orderCount: 10 },
      { hour: 19, orderCount: 10 },
      { hour: 20, orderCount: 10 },
    ]);
    mocks.getReportsWeekdayDistribution.mockReset().mockResolvedValue([
      { weekday: 6, orderCount: 40 },
      { weekday: 5, orderCount: 35 },
    ]);

    const short = await getAdvancedReports(
      context,
      { preset: 'LAST_7_DAYS' },
      new Date('2026-08-18T15:34:00.000Z'),
    );
    expect(short.hours.peak?.label).toBe('18h–20h');
    expect(short.hours.strongestWeekday).toBeNull();
    expect(mocks.getReportsWeekdayDistribution).not.toHaveBeenCalled();

    mocks.getReportsSummary
      .mockResolvedValueOnce({
        operationalOrders: 186,
        cancelledOrders: 7,
        completedPaidOrders: 172,
        completedValueCents: BigInt(842050),
      })
      .mockResolvedValueOnce({
        operationalOrders: 160,
        cancelledOrders: 8,
        completedPaidOrders: 150,
        completedValueCents: BigInt(720000),
      });
    mocks.getReportsDurations
      .mockResolvedValueOnce({
        averageAcceptanceSeconds: 132,
        acceptanceSampleSize: 168,
        averagePreparationSeconds: 1074,
        preparationSampleSize: 151,
      })
      .mockResolvedValueOnce({
        averageAcceptanceSeconds: 150,
        acceptanceSampleSize: 140,
        averagePreparationSeconds: 900,
        preparationSampleSize: 130,
      });
    mocks.getReportsSlaCounts
      .mockResolvedValueOnce({ attentionOrders: 9, criticalOrders: 3 })
      .mockResolvedValueOnce({ attentionOrders: 6, criticalOrders: 2 });

    const long = await getAdvancedReports(
      context,
      { preset: 'LAST_30_DAYS' },
      new Date('2026-08-18T15:34:00.000Z'),
    );
    expect(long.hours.strongestWeekday).toMatchObject({ weekday: 6, label: 'Sábado' });
  });

  it('mantém a modalidade ausente como zero sem divisão inválida', async () => {
    mocks.getReportsModalities.mockReset().mockResolvedValue([
      {
        modality: 'DELIVERY',
        orderCount: 186,
        cancelledOrders: 7,
        completedPaidOrders: 172,
        completedValueCents: BigInt(842050),
      },
    ]);

    const result = await getAdvancedReports(
      context,
      { preset: 'LAST_7_DAYS' },
      new Date('2026-08-18T15:34:00.000Z'),
    );

    expect(result.modalities[1]).toEqual({
      modality: 'PICKUP',
      label: 'Retirada',
      orderCount: 0,
      sharePercent: 0,
      completedPaidOrders: 0,
      averageTicketCents: 0,
      cancelledOrders: 0,
      cancelledRatePercent: 0,
    });
  });

  it('envia tenant, loja e timezone para todas as agregações', async () => {
    await getAdvancedReports(
      context,
      { preset: 'LAST_7_DAYS' },
      new Date('2026-08-18T15:34:00.000Z'),
    );

    const currentScope = mocks.getReportsSeries.mock.calls[0]?.[0];
    expect(currentScope).toMatchObject({
      tenantId: 'tenant-a',
      storeId: 'store-a',
      timeZone: 'America/Fortaleza',
    });
    expect(currentScope.start).toBeInstanceOf(Date);
    expect(currentScope.end).toBeInstanceOf(Date);
    expect(mocks.getReportsProductTrends).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-a', storeId: 'store-a' }),
      expect.objectContaining({ tenantId: 'tenant-a', storeId: 'store-a' }),
    );
  });
});

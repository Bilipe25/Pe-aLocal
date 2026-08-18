import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getAdvancedReports } from '@/server/services/reports.service';

const mocks = vi.hoisted(() => ({
  getReportsSummary: vi.fn(),
  getReportsSeries: vi.fn(),
  getReportsTopProducts: vi.fn(),
  getReportsPeakHour: vi.fn(),
  getReportsDurations: vi.fn(),
  getReportsModalities: vi.fn(),
  countReportsAttentionAlerts: vi.fn(),
}));

vi.mock('@/server/repositories/reports.repository', () => mocks);

const context = {
  tenantId: 'tenant-a',
  storeId: 'store-a',
  timeZone: 'America/Fortaleza',
  operationalSlaEnabled: true,
};

describe('serviço agregado de relatórios', () => {
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
        cancelledOrders: 0,
        completedPaidOrders: 150,
        completedValueCents: BigInt(0),
      });
    mocks.getReportsSeries.mockResolvedValue([
      { key: '2026-08-12', orderCount: 22, completedValueCents: BigInt(98200) },
      { key: '2026-08-13', orderCount: 31, completedValueCents: BigInt(147500) },
    ]);
    mocks.getReportsTopProducts.mockResolvedValue([
      { productId: 'product-a', name: 'X-Bacon da Casa', quantity: 74 },
      { productId: 'product-b', name: 'Batata crocante', quantity: 58 },
    ]);
    mocks.getReportsPeakHour.mockResolvedValue({ hour: 19, orderCount: 42 });
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
        averagePreparationSeconds: 1100,
        preparationSampleSize: 130,
      });
    mocks.getReportsModalities.mockResolvedValue([
      { modality: 'DELIVERY', _count: { _all: 121 } },
      { modality: 'PICKUP', _count: { _all: 65 } },
    ]);
    mocks.countReportsAttentionAlerts.mockResolvedValue(9);
  });

  it('mantém coerência comercial, comparação sem base e no máximo três insights', async () => {
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
    expect(result.summary.comparisons.completedValue.label).toBe('Sem base anterior');
    expect(result.peakHour).toMatchObject({ label: '19h–20h', orderCount: 42 });
    expect(result.operation.attentionAlertsCount).toBe(9);
    expect(result.insights).toHaveLength(3);
    expect(result.modalities).toEqual([
      { modality: 'DELIVERY', label: 'Entrega', orderCount: 121, sharePercent: 65.1 },
      { modality: 'PICKUP', label: 'Retirada', orderCount: 65, sharePercent: 34.9 },
    ]);
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

    expect(result.hasEnoughDataForInsights).toBe(false);
    expect(result.insights).toEqual([]);
    expect(result.operation.attentionAlertsCount).toBeNull();
    expect(mocks.countReportsAttentionAlerts).not.toHaveBeenCalled();
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
  });
});

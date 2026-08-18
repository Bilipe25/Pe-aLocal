import 'server-only';

import {
  addLocalDays,
  resolveReportPeriod,
  type ResolvedReportPeriod,
} from '@/domain/reports/report-period';
import * as reportsRepo from '@/server/repositories/reports.repository';
import type {
  AdvancedReportsDTO,
  ReportMetricComparison,
  ReportSeriesGranularity,
  ReportsPeriodInput,
} from '@/types/reports';

export const REPORTS_INSIGHTS_MINIMUM_SAMPLE = 5;

export interface ReportsServiceContext {
  tenantId: string;
  storeId: string;
  timeZone: string;
  operationalSlaEnabled: boolean;
}

function safeNumber(value: bigint | number): number {
  const parsed = typeof value === 'bigint' ? Number(value) : value;
  if (!Number.isSafeInteger(parsed)) {
    throw new RangeError('Um valor agregado dos relatórios excedeu o limite seguro.');
  }
  return parsed;
}

function comparison(current: number, previous: number): ReportMetricComparison {
  if (previous === 0) {
    return { direction: 'NO_BASE', changePercent: null, label: 'Sem base anterior' };
  }
  const raw = ((current - previous) / previous) * 100;
  const changePercent = Math.round(raw * 10) / 10;
  if (Math.abs(changePercent) < 0.1) {
    return { direction: 'STABLE', changePercent: 0, label: 'Sem mudança relevante' };
  }
  return {
    direction: changePercent > 0 ? 'UP' : 'DOWN',
    changePercent,
    label: `${Math.abs(changePercent).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% ${changePercent > 0 ? 'acima' : 'abaixo'} do período anterior`,
  };
}

function localDateLabel(localDate: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat('pt-BR', { ...options, timeZone: 'UTC' })
    .format(new Date(`${localDate}T12:00:00.000Z`))
    .replace('.', '');
}

function seriesLabels(key: string, granularity: ReportSeriesGranularity, durationDays: number) {
  if (granularity === 'HOUR') {
    const hour = Number(key.slice(11, 13));
    return {
      label: `${String(hour).padStart(2, '0')}h`,
      fullLabel: `${String(hour).padStart(2, '0')}h–${String((hour + 1) % 24).padStart(2, '0')}h`,
    };
  }
  if (granularity === 'DAY' && durationDays <= 7) {
    return {
      label: localDateLabel(key, { weekday: 'short' }),
      fullLabel: localDateLabel(key, { weekday: 'long', day: '2-digit', month: 'long' }),
    };
  }
  return {
    label: localDateLabel(key, { day: '2-digit', month: 'short' }),
    fullLabel:
      granularity === 'WEEK'
        ? `Semana de ${localDateLabel(key, { day: '2-digit', month: 'long' })}`
        : localDateLabel(key, { day: '2-digit', month: 'long', year: 'numeric' }),
  };
}

function completeDailySeries(
  rows: Awaited<ReturnType<typeof reportsRepo.getReportsSeries>>,
  period: ResolvedReportPeriod,
) {
  if (period.granularity !== 'DAY') return rows;
  const byKey = new Map(rows.map((row) => [row.key, row]));
  const complete = [];
  for (let index = 0; index < period.durationDays; index += 1) {
    const key = addLocalDays(period.startLocalDate, index);
    complete.push(byKey.get(key) ?? { key, orderCount: 0, completedValueCents: 0 });
  }
  return complete;
}

function hourLabel(hour: number) {
  return `${String(hour).padStart(2, '0')}h–${String((hour + 1) % 24).padStart(2, '0')}h`;
}

function secondsChangeText(current: number, previous: number) {
  const difference = Math.round(Math.abs(previous - current));
  const unit = difference === 1 ? 'segundo' : 'segundos';
  return `Aceite ficou ${difference} ${unit} ${current < previous ? 'mais rápido' : 'mais lento'} que no período anterior.`;
}

function buildInsights(input: {
  operationalOrders: number;
  peakHour: AdvancedReportsDTO['peakHour'];
  products: AdvancedReportsDTO['products'];
  currentAcceptanceSeconds: number | null;
  currentAcceptanceSample: number;
  previousAcceptanceSeconds: number | null;
  previousAcceptanceSample: number;
}): AdvancedReportsDTO['insights'] {
  if (input.operationalOrders < REPORTS_INSIGHTS_MINIMUM_SAMPLE) return [];

  const insights: AdvancedReportsDTO['insights'] = [];
  if (input.peakHour) {
    insights.push({
      id: 'PEAK_HOUR',
      text: `${input.peakHour.label} foi o horário mais forte, com ${input.peakHour.orderCount} pedidos.`,
    });
  }
  const topProduct = input.products[0];
  if (topProduct) {
    insights.push({
      id: 'TOP_PRODUCT',
      text: `${topProduct.name} liderou as saídas, com ${topProduct.quantity} unidades.`,
    });
  }
  if (
    input.currentAcceptanceSeconds !== null &&
    input.previousAcceptanceSeconds !== null &&
    input.currentAcceptanceSample >= REPORTS_INSIGHTS_MINIMUM_SAMPLE &&
    input.previousAcceptanceSample >= REPORTS_INSIGHTS_MINIMUM_SAMPLE &&
    Math.abs(input.currentAcceptanceSeconds - input.previousAcceptanceSeconds) >= 1
  ) {
    insights.push({
      id: 'ACCEPTANCE_CHANGE',
      text: secondsChangeText(input.currentAcceptanceSeconds, input.previousAcceptanceSeconds),
    });
  }
  return insights.slice(0, 3);
}

export async function getAdvancedReports(
  context: ReportsServiceContext,
  input: ReportsPeriodInput,
  now: Date = new Date(),
): Promise<AdvancedReportsDTO> {
  const period = resolveReportPeriod(input, context.timeZone, now);
  const currentScope: reportsRepo.ReportsQueryScope = {
    tenantId: context.tenantId,
    storeId: context.storeId,
    timeZone: context.timeZone,
    ...period.current,
  };
  const previousScope: reportsRepo.ReportsQueryScope = {
    tenantId: context.tenantId,
    storeId: context.storeId,
    timeZone: context.timeZone,
    ...period.previous,
  };

  const [
    currentSummary,
    previousSummary,
    rawSeries,
    products,
    peakHourRow,
    currentDurations,
    previousDurations,
    modalityGroups,
    attentionAlertsCount,
  ] = await Promise.all([
    reportsRepo.getReportsSummary(currentScope),
    reportsRepo.getReportsSummary(previousScope),
    reportsRepo.getReportsSeries(currentScope, period.granularity),
    reportsRepo.getReportsTopProducts(currentScope),
    reportsRepo.getReportsPeakHour(currentScope),
    reportsRepo.getReportsDurations(currentScope),
    reportsRepo.getReportsDurations(previousScope),
    reportsRepo.getReportsModalities(currentScope),
    context.operationalSlaEnabled
      ? reportsRepo.countReportsAttentionAlerts(currentScope)
      : Promise.resolve(null),
  ]);

  const completedValueCents = safeNumber(currentSummary.completedValueCents);
  const previousCompletedValueCents = safeNumber(previousSummary.completedValueCents);
  const averageTicketCents =
    currentSummary.completedPaidOrders > 0
      ? Math.round(completedValueCents / currentSummary.completedPaidOrders)
      : 0;
  const previousAverageTicketCents =
    previousSummary.completedPaidOrders > 0
      ? Math.round(previousCompletedValueCents / previousSummary.completedPaidOrders)
      : 0;
  const cancelledRatePercent =
    currentSummary.operationalOrders > 0
      ? Math.round((currentSummary.cancelledOrders / currentSummary.operationalOrders) * 1000) / 10
      : 0;
  const peakHour = peakHourRow
    ? {
        hour: peakHourRow.hour,
        label: hourLabel(peakHourRow.hour),
        orderCount: peakHourRow.orderCount,
        sharePercent:
          currentSummary.operationalOrders > 0
            ? Math.round((peakHourRow.orderCount / currentSummary.operationalOrders) * 1000) / 10
            : 0,
      }
    : null;
  const mappedProducts = products.map((product) => ({
    productId: product.productId,
    name: product.name,
    quantity: product.quantity,
  }));
  const completeSeries = completeDailySeries(rawSeries, period);
  const series = completeSeries.map((row) => ({
    key: row.key,
    ...seriesLabels(row.key, period.granularity, period.durationDays),
    orderCount: row.orderCount,
    completedValueCents: safeNumber(row.completedValueCents),
  }));

  const modalityCounts = new Map(
    modalityGroups.map((group) => [group.modality, group._count._all]),
  );
  const modalities = (['DELIVERY', 'PICKUP'] as const).map((modality) => {
    const orderCount = modalityCounts.get(modality) ?? 0;
    return {
      modality,
      label: modality === 'DELIVERY' ? 'Entrega' : 'Retirada',
      orderCount,
      sharePercent:
        currentSummary.operationalOrders > 0
          ? Math.round((orderCount / currentSummary.operationalOrders) * 1000) / 10
          : 0,
    };
  });

  const insights = buildInsights({
    operationalOrders: currentSummary.operationalOrders,
    peakHour,
    products: mappedProducts,
    currentAcceptanceSeconds: currentDurations.averageAcceptanceSeconds,
    currentAcceptanceSample: currentDurations.acceptanceSampleSize,
    previousAcceptanceSeconds: previousDurations.averageAcceptanceSeconds,
    previousAcceptanceSample: previousDurations.acceptanceSampleSize,
  });

  return {
    period: {
      preset: period.preset,
      label: period.label,
      comparisonLabel: period.comparisonLabel,
      startLocalDate: period.startLocalDate,
      endLocalDate: period.endLocalDate,
      timeZone: context.timeZone,
      granularity: period.granularity,
    },
    summary: {
      completedValueCents,
      operationalOrders: currentSummary.operationalOrders,
      completedPaidOrders: currentSummary.completedPaidOrders,
      averageTicketCents,
      cancelledOrders: currentSummary.cancelledOrders,
      cancelledRatePercent,
      comparisons: {
        completedValue: comparison(completedValueCents, previousCompletedValueCents),
        operationalOrders: comparison(
          currentSummary.operationalOrders,
          previousSummary.operationalOrders,
        ),
        averageTicket: comparison(averageTicketCents, previousAverageTicketCents),
        cancelledOrders: comparison(
          currentSummary.cancelledOrders,
          previousSummary.cancelledOrders,
        ),
      },
    },
    series,
    products: mappedProducts,
    peakHour,
    operation: {
      averageAcceptanceSeconds: currentDurations.averageAcceptanceSeconds,
      acceptanceSampleSize: currentDurations.acceptanceSampleSize,
      averagePreparationSeconds: currentDurations.averagePreparationSeconds,
      preparationSampleSize: currentDurations.preparationSampleSize,
      attentionAlertsCount,
    },
    modalities,
    insights,
    insightsMinimumSample: REPORTS_INSIGHTS_MINIMUM_SAMPLE,
    hasEnoughDataForInsights: currentSummary.operationalOrders >= REPORTS_INSIGHTS_MINIMUM_SAMPLE,
  };
}

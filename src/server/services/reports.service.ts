import 'server-only';

import {
  ADVANCED_REPORT_THRESHOLDS,
  buildAdvancedReportInsights,
} from '@/domain/reports/advanced-report-insights';
import {
  addLocalDays,
  resolveReportPeriod,
  type ResolvedReportPeriod,
} from '@/domain/reports/report-period';
import * as reportsRepo from '@/server/repositories/reports.repository';
import type {
  AdvancedReportsDTO,
  ReportDurationComparison,
  ReportMetricComparison,
  ReportSeriesGranularity,
  ReportsPeriodInput,
} from '@/types/reports';

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

function roundOne(value: number) {
  return Math.round(value * 10) / 10;
}

function percentageChange(current: number, previous: number) {
  if (previous === 0) return null;
  return roundOne(((current - previous) / previous) * 100);
}

function comparison(current: number, previous: number): ReportMetricComparison {
  const changePercent = percentageChange(current, previous);
  if (changePercent === null) {
    return { direction: 'NO_BASE', changePercent: null, label: 'Sem base anterior' };
  }
  if (Math.abs(changePercent) < 0.1) {
    return { direction: 'STABLE', changePercent: 0, label: 'Sem mudança relevante' };
  }
  return {
    direction: changePercent > 0 ? 'UP' : 'DOWN',
    changePercent,
    label: `${Math.abs(changePercent).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% ${changePercent > 0 ? 'acima' : 'abaixo'} do intervalo anterior`,
  };
}

function formatDurationCompact(seconds: number) {
  const rounded = Math.round(Math.abs(seconds));
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor(rounded / 60);
  const remaining = rounded % 60;
  if (hours > 0) {
    const minutesWithinHour = minutes % 60;
    return `${hours} h ${String(minutesWithinHour).padStart(2, '0')} min`;
  }
  if (minutes === 0) return `${remaining} s`;
  if (remaining === 0) return `${minutes} min`;
  return `${minutes} min ${String(remaining).padStart(2, '0')} s`;
}

function durationComparison(
  current: number | null,
  currentSample: number,
  previous: number | null,
  previousSample: number,
  minimumChangeSeconds: number,
): ReportDurationComparison {
  if (
    current === null ||
    previous === null ||
    currentSample < ADVANCED_REPORT_THRESHOLDS.minimumInsightOrders ||
    previousSample < ADVANCED_REPORT_THRESHOLDS.minimumInsightOrders
  ) {
    return {
      direction: 'NO_BASE',
      changeSeconds: null,
      changePercent: null,
      label: 'Sem base comparável',
    };
  }
  const changeSeconds = Math.round(current - previous);
  const changePercent = percentageChange(current, previous);
  if (
    Math.abs(changeSeconds) < minimumChangeSeconds ||
    Math.abs(changePercent ?? 0) < ADVANCED_REPORT_THRESHOLDS.minimumOperationalChangePercent
  ) {
    return {
      direction: 'STABLE',
      changeSeconds,
      changePercent,
      label: 'Sem mudança relevante',
    };
  }
  const slower = changeSeconds > 0;
  return {
    direction: slower ? 'SLOWER' : 'FASTER',
    changeSeconds,
    changePercent,
    label: `${formatDurationCompact(changeSeconds)} ${slower ? 'mais lento' : 'mais rápido'}`,
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

function hourWindowLabel(startHour: number) {
  return `${String(startHour).padStart(2, '0')}h–${String(startHour + 2).padStart(2, '0')}h`;
}

function buildHourPatterns(
  rows: reportsRepo.HourDistributionRow[],
  operationalOrders: number,
  durationDays: number,
): AdvancedReportsDTO['hours'] {
  if (operationalOrders < ADVANCED_REPORT_THRESHOLDS.minimumHourlyWindowOrders) {
    return { peak: null, quiet: null, strongestWeekday: null };
  }
  const counts = Array.from({ length: 24 }, () => 0);
  for (const row of rows) counts[row.hour] = row.orderCount;
  const activeHours = rows.filter((row) => row.orderCount > 0).map((row) => row.hour);
  if (activeHours.length === 0) return { peak: null, quiet: null, strongestWeekday: null };
  const firstActive = Math.min(...activeHours);
  const lastActive = Math.max(...activeHours);
  const windows = Array.from({ length: 23 }, (_, startHour) => ({
    startHour,
    endHour: startHour + 2,
    orderCount: counts[startHour] + counts[startHour + 1],
  })).filter(
    (window) =>
      window.startHour >= firstActive && window.startHour < lastActive && window.orderCount > 0,
  );
  const peakWindow = [...windows].sort(
    (left, right) => right.orderCount - left.orderCount || left.startHour - right.startHour,
  )[0];
  const quietWindow =
    durationDays >= 7
      ? [...windows].sort(
          (left, right) => left.orderCount - right.orderCount || left.startHour - right.startHour,
        )[0]
      : undefined;
  const mapWindow = (window: (typeof windows)[number] | undefined) =>
    window
      ? {
          ...window,
          label: hourWindowLabel(window.startHour),
          sharePercent: roundOne((window.orderCount / operationalOrders) * 100),
        }
      : null;
  return { peak: mapWindow(peakWindow), quiet: mapWindow(quietWindow), strongestWeekday: null };
}

const WEEKDAY_LABELS = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
] as const;

function strongestWeekday(
  rows: reportsRepo.WeekdayDistributionRow[],
  operationalOrders: number,
  durationDays: number,
): AdvancedReportsDTO['hours']['strongestWeekday'] {
  if (durationDays < 28 || operationalOrders < ADVANCED_REPORT_THRESHOLDS.minimumInsightOrders) {
    return null;
  }
  const strongest = [...rows].sort(
    (left, right) => right.orderCount - left.orderCount || left.weekday - right.weekday,
  )[0];
  if (!strongest) return null;
  return {
    weekday: strongest.weekday,
    label: WEEKDAY_LABELS[strongest.weekday] ?? 'Dia da semana',
    orderCount: strongest.orderCount,
    sharePercent: roundOne((strongest.orderCount / operationalOrders) * 100),
  };
}

function buildProductViews(rows: reportsRepo.ProductTrendRow[]): AdvancedReportsDTO['products'] {
  const top = rows
    .filter((row) => row.currentQuantity > 0)
    .sort(
      (left, right) =>
        right.currentQuantity - left.currentQuantity ||
        left.productId.localeCompare(right.productId),
    )
    .slice(0, 5)
    .map((row) => ({ productId: row.productId, name: row.name, quantity: row.currentQuantity }));

  const movements = rows
    .flatMap<AdvancedReportsDTO['products']['movements'][number]>((row) => {
      if (
        row.previousQuantity === 0 &&
        row.currentQuantity >= ADVANCED_REPORT_THRESHOLDS.minimumProductReferenceQuantity
      ) {
        return [
          {
            productId: row.productId,
            name: row.name,
            currentQuantity: row.currentQuantity,
            previousQuantity: 0,
            direction: 'NEW',
            changePercent: null,
            label: 'Novo no período',
          },
        ];
      }
      if (row.previousQuantity === 0) return [];
      const absoluteChange = row.currentQuantity - row.previousQuantity;
      const changePercent = percentageChange(row.currentQuantity, row.previousQuantity);
      if (
        Math.abs(absoluteChange) < ADVANCED_REPORT_THRESHOLDS.minimumProductAbsoluteChange ||
        Math.abs(changePercent ?? 0) < ADVANCED_REPORT_THRESHOLDS.minimumProductChangePercent ||
        Math.max(row.currentQuantity, row.previousQuantity) <
          ADVANCED_REPORT_THRESHOLDS.minimumProductReferenceQuantity
      ) {
        return [];
      }
      const direction = absoluteChange > 0 ? 'UP' : 'DOWN';
      return [
        {
          productId: row.productId,
          name: row.name,
          currentQuantity: row.currentQuantity,
          previousQuantity: row.previousQuantity,
          direction,
          changePercent,
          label: `${direction === 'UP' ? '+' : '−'}${Math.abs(changePercent ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`,
        },
      ];
    })
    .sort((left, right) => {
      if (left.direction === 'NEW' && right.direction !== 'NEW') return 1;
      if (right.direction === 'NEW' && left.direction !== 'NEW') return -1;
      return (
        Math.abs(right.changePercent ?? 0) - Math.abs(left.changePercent ?? 0) ||
        right.currentQuantity - left.currentQuantity ||
        left.productId.localeCompare(right.productId)
      );
    })
    .slice(0, 4);

  return { top, movements };
}

function buildPeakDurationWindow(
  rows: reportsRepo.HourDurationRow[],
  stage: 'ACCEPTANCE' | 'PREPARATION',
  overallAverage: number,
) {
  const windows = Array.from({ length: 23 }, (_, startHour) => {
    const members = rows.filter((row) => row.hour === startHour || row.hour === startHour + 1);
    const sampleSize = members.reduce(
      (sum, row) =>
        sum + (stage === 'PREPARATION' ? row.preparationSampleSize : row.acceptanceSampleSize),
      0,
    );
    const weightedTotal = members.reduce((sum, row) => {
      const average =
        stage === 'PREPARATION' ? row.averagePreparationSeconds : row.averageAcceptanceSeconds;
      const sample = stage === 'PREPARATION' ? row.preparationSampleSize : row.acceptanceSampleSize;
      return sum + (average ?? 0) * sample;
    }, 0);
    return {
      startHour,
      averageSeconds: sampleSize > 0 ? weightedTotal / sampleSize : 0,
      sampleSize,
    };
  }).filter(
    (window) =>
      window.sampleSize >= ADVANCED_REPORT_THRESHOLDS.minimumHourlyWindowOrders &&
      window.averageSeconds > overallAverage,
  );
  const highest = [...windows].sort(
    (left, right) => right.averageSeconds - left.averageSeconds || left.startHour - right.startHour,
  )[0];
  if (!highest) return null;
  return {
    label: hourWindowLabel(highest.startHour),
    averageSeconds: Math.round(highest.averageSeconds),
    sampleSize: highest.sampleSize,
  };
}

function buildBottleneck(
  current: reportsRepo.DurationRow,
  previous: reportsRepo.DurationRow,
  hourly: reportsRepo.HourDurationRow[],
  acceptance: ReportDurationComparison,
  preparation: ReportDurationComparison,
): AdvancedReportsDTO['operation']['bottleneck'] {
  const candidates: Array<{
    stage: 'ACCEPTANCE' | 'PREPARATION';
    currentAverage: number | null;
    previousAverage: number | null;
    comparison: ReportDurationComparison;
    minimum: number;
  }> = [
    {
      stage: 'PREPARATION',
      currentAverage: current.averagePreparationSeconds,
      previousAverage: previous.averagePreparationSeconds,
      comparison: preparation,
      minimum: ADVANCED_REPORT_THRESHOLDS.minimumPreparationChangeSeconds,
    },
    {
      stage: 'ACCEPTANCE',
      currentAverage: current.averageAcceptanceSeconds,
      previousAverage: previous.averageAcceptanceSeconds,
      comparison: acceptance,
      minimum: ADVANCED_REPORT_THRESHOLDS.minimumAcceptanceChangeSeconds,
    },
  ];
  const selected = candidates
    .filter(
      (candidate) =>
        candidate.comparison.direction === 'SLOWER' &&
        candidate.currentAverage !== null &&
        candidate.previousAverage !== null &&
        candidate.comparison.changeSeconds !== null,
    )
    .sort(
      (left, right) =>
        Math.abs((right.comparison.changeSeconds ?? 0) / right.minimum) -
        Math.abs((left.comparison.changeSeconds ?? 0) / left.minimum),
    )[0];
  if (
    !selected ||
    selected.currentAverage === null ||
    selected.previousAverage === null ||
    selected.comparison.changeSeconds === null
  ) {
    return null;
  }
  const stageLabel = selected.stage === 'PREPARATION' ? 'preparo' : 'aceite';
  const peakWindow = buildPeakDurationWindow(hourly, selected.stage, selected.currentAverage);
  return {
    stage: selected.stage,
    title: `O principal aumento aconteceu no ${stageLabel}.`,
    description: peakWindow
      ? `Entre ${peakWindow.label}, a média chegou a ${formatDurationCompact(peakWindow.averageSeconds)}.`
      : `A média ficou ${formatDurationCompact(selected.comparison.changeSeconds)} mais lenta que no intervalo anterior.`,
    currentAverageSeconds: Math.round(selected.currentAverage),
    previousAverageSeconds: Math.round(selected.previousAverage),
    changeSeconds: selected.comparison.changeSeconds,
    peakWindow,
  };
}

function buildTrend(
  currentOrders: number,
  previousOrders: number,
  comparisonValue: ReportMetricComparison,
): AdvancedReportsDTO['trend'] {
  if (
    currentOrders < ADVANCED_REPORT_THRESHOLDS.minimumInsightOrders ||
    previousOrders < ADVANCED_REPORT_THRESHOLDS.minimumInsightOrders ||
    comparisonValue.changePercent === null
  ) {
    return {
      direction: 'INSUFFICIENT',
      label: 'Sem tendência comparável',
      description: 'Ainda não há base suficiente para descrever uma mudança com segurança.',
      sampleSize: currentOrders,
    };
  }
  if (
    Math.abs(comparisonValue.changePercent) <
    ADVANCED_REPORT_THRESHOLDS.minimumCommercialChangePercent
  ) {
    return {
      direction: 'STABLE',
      label: 'Movimento estável',
      description: 'A variação ficou abaixo do limite considerado relevante.',
      sampleSize: currentOrders,
    };
  }
  const growing = comparisonValue.changePercent > 0;
  return {
    direction: growing ? 'GROWING' : 'DECLINING',
    label: growing ? 'Tendência de crescimento' : 'Tendência de queda',
    description: `${Math.abs(comparisonValue.changePercent).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% ${growing ? 'acima' : 'abaixo'} do intervalo anterior. Histórico, não previsão.`,
    sampleSize: currentOrders,
  };
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
    productRows,
    hourRows,
    weekdayRows,
    currentDurations,
    previousDurations,
    durationHourRows,
    modalityRows,
    currentSla,
    previousSla,
  ] = await Promise.all([
    reportsRepo.getReportsSummary(currentScope),
    reportsRepo.getReportsSummary(previousScope),
    reportsRepo.getReportsSeries(currentScope, period.granularity),
    reportsRepo.getReportsProductTrends(currentScope, previousScope),
    reportsRepo.getReportsHourDistribution(currentScope),
    period.durationDays >= 28
      ? reportsRepo.getReportsWeekdayDistribution(currentScope)
      : Promise.resolve([]),
    reportsRepo.getReportsDurations(currentScope),
    reportsRepo.getReportsDurations(previousScope),
    reportsRepo.getReportsDurationsByHour(currentScope),
    reportsRepo.getReportsModalities(currentScope),
    context.operationalSlaEnabled
      ? reportsRepo.getReportsSlaCounts(currentScope)
      : Promise.resolve(null),
    context.operationalSlaEnabled
      ? reportsRepo.getReportsSlaCounts(previousScope)
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
      ? roundOne((currentSummary.cancelledOrders / currentSummary.operationalOrders) * 100)
      : 0;
  const operationalOrdersComparison = comparison(
    currentSummary.operationalOrders,
    previousSummary.operationalOrders,
  );
  const products = buildProductViews(productRows);
  const hours = buildHourPatterns(hourRows, currentSummary.operationalOrders, period.durationDays);
  hours.strongestWeekday = strongestWeekday(
    weekdayRows,
    currentSummary.operationalOrders,
    period.durationDays,
  );
  const acceptanceComparison = durationComparison(
    currentDurations.averageAcceptanceSeconds,
    currentDurations.acceptanceSampleSize,
    previousDurations.averageAcceptanceSeconds,
    previousDurations.acceptanceSampleSize,
    ADVANCED_REPORT_THRESHOLDS.minimumAcceptanceChangeSeconds,
  );
  const preparationComparison = durationComparison(
    currentDurations.averagePreparationSeconds,
    currentDurations.preparationSampleSize,
    previousDurations.averagePreparationSeconds,
    previousDurations.preparationSampleSize,
    ADVANCED_REPORT_THRESHOLDS.minimumPreparationChangeSeconds,
  );
  const bottleneck = buildBottleneck(
    currentDurations,
    previousDurations,
    durationHourRows,
    acceptanceComparison,
    preparationComparison,
  );

  const modalityByName = new Map(modalityRows.map((row) => [row.modality, row]));
  const modalities = (['DELIVERY', 'PICKUP', 'DINE_IN'] as const).map((modality) => {
    const row = modalityByName.get(modality);
    const orderCount = row?.orderCount ?? 0;
    const completedPaidOrders = row?.completedPaidOrders ?? 0;
    const completedModalityValue = safeNumber(row?.completedValueCents ?? 0);
    const cancelledOrders = row?.cancelledOrders ?? 0;
    return {
      modality,
      label: modality === 'DELIVERY' ? 'Entrega' : modality === 'DINE_IN' ? 'Salão' : 'Retirada',
      orderCount,
      sharePercent:
        currentSummary.operationalOrders > 0
          ? roundOne((orderCount / currentSummary.operationalOrders) * 100)
          : 0,
      completedPaidOrders,
      averageTicketCents:
        completedPaidOrders > 0 ? Math.round(completedModalityValue / completedPaidOrders) : 0,
      cancelledOrders,
      cancelledRatePercent: orderCount > 0 ? roundOne((cancelledOrders / orderCount) * 100) : 0,
    };
  });

  const sla =
    currentSla && previousSla
      ? {
          attentionOrders: currentSla.attentionOrders,
          criticalOrders: currentSla.criticalOrders,
          comparison: comparison(currentSla.attentionOrders, previousSla.attentionOrders),
        }
      : null;
  const completeSeries = completeDailySeries(rawSeries, period);
  const series = completeSeries.map((row) => ({
    key: row.key,
    ...seriesLabels(row.key, period.granularity, period.durationDays),
    orderCount: row.orderCount,
    completedValueCents: safeNumber(row.completedValueCents),
  }));
  const insights = buildAdvancedReportInsights({
    currentOperationalOrders: currentSummary.operationalOrders,
    previousOperationalOrders: previousSummary.operationalOrders,
    operationalOrdersChangePercent: operationalOrdersComparison.changePercent,
    productMovements: products.movements,
    bottleneck,
    modalities,
    peakHour: hours.peak,
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
        operationalOrders: operationalOrdersComparison,
        averageTicket: comparison(averageTicketCents, previousAverageTicketCents),
        cancelledOrders: comparison(
          currentSummary.cancelledOrders,
          previousSummary.cancelledOrders,
        ),
      },
    },
    trend: buildTrend(
      currentSummary.operationalOrders,
      previousSummary.operationalOrders,
      operationalOrdersComparison,
    ),
    series,
    products,
    hours,
    operation: {
      averageAcceptanceSeconds:
        currentDurations.averageAcceptanceSeconds === null
          ? null
          : Math.round(currentDurations.averageAcceptanceSeconds),
      acceptanceSampleSize: currentDurations.acceptanceSampleSize,
      acceptanceComparison,
      averagePreparationSeconds:
        currentDurations.averagePreparationSeconds === null
          ? null
          : Math.round(currentDurations.averagePreparationSeconds),
      preparationSampleSize: currentDurations.preparationSampleSize,
      preparationComparison,
      bottleneck,
      sla,
    },
    modalities,
    insights,
    intelligenceState:
      currentSummary.operationalOrders >= ADVANCED_REPORT_THRESHOLDS.minimumInsightOrders &&
      previousSummary.operationalOrders >= ADVANCED_REPORT_THRESHOLDS.minimumInsightOrders
        ? 'READY'
        : 'INSUFFICIENT',
  };
}

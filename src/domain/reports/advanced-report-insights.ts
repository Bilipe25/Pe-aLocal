import type { AdvancedReportInsight, AdvancedReportsDTO } from '@/types/reports';

export const ADVANCED_REPORT_THRESHOLDS = Object.freeze({
  minimumInsightOrders: 5,
  minimumCommercialChangePercent: 8,
  minimumProductReferenceQuantity: 5,
  minimumProductAbsoluteChange: 3,
  minimumProductChangePercent: 15,
  minimumHourlyWindowOrders: 5,
  minimumAcceptanceChangeSeconds: 30,
  minimumPreparationChangeSeconds: 60,
  minimumOperationalChangePercent: 15,
  minimumDominantModalitySharePercent: 65,
  minimumPeakHourSharePercent: 25,
  maximumVisibleInsights: 3,
});

function formatPercent(value: number) {
  return Math.abs(value).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
}

function formatDuration(seconds: number) {
  const rounded = Math.round(Math.abs(seconds));
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor(rounded / 60);
  const remainingSeconds = rounded % 60;
  if (hours > 0) {
    const minutesWithinHour = minutes % 60;
    return `${hours} h ${String(minutesWithinHour).padStart(2, '0')} min`;
  }
  if (minutes === 0) return `${remainingSeconds} s`;
  if (remainingSeconds === 0) return `${minutes} min`;
  return `${minutes} min ${String(remainingSeconds).padStart(2, '0')} s`;
}

export interface BuildAdvancedReportInsightsInput {
  currentOperationalOrders: number;
  previousOperationalOrders: number;
  operationalOrdersChangePercent: number | null;
  productMovements: AdvancedReportsDTO['products']['movements'];
  bottleneck: AdvancedReportsDTO['operation']['bottleneck'];
  modalities: AdvancedReportsDTO['modalities'];
  peakHour: AdvancedReportsDTO['hours']['peak'];
}

export function buildAdvancedReportInsights(
  input: BuildAdvancedReportInsightsInput,
): AdvancedReportInsight[] {
  if (input.currentOperationalOrders < ADVANCED_REPORT_THRESHOLDS.minimumInsightOrders) {
    return [];
  }

  const insights: AdvancedReportInsight[] = [];

  if (input.bottleneck) {
    const stageLabel = input.bottleneck.stage === 'PREPARATION' ? 'preparo' : 'aceite';
    insights.push({
      id: input.bottleneck.stage === 'PREPARATION' ? 'PREPARATION_BOTTLENECK' : 'ACCEPTANCE_CHANGE',
      category: 'OPERATION',
      priority: 100,
      tone: 'ATTENTION',
      title: `${stageLabel === 'preparo' ? 'Preparo' : 'Aceite'} pede atenção`,
      description: input.bottleneck.peakWindow
        ? `Ficou ${formatDuration(input.bottleneck.changeSeconds)} mais lento; a maior média apareceu entre ${input.bottleneck.peakWindow.label}.`
        : `Ficou ${formatDuration(input.bottleneck.changeSeconds)} mais lento que no período anterior.`,
      evidence: {
        metric:
          input.bottleneck.stage === 'PREPARATION'
            ? 'AVERAGE_PREPARATION_SECONDS'
            : 'AVERAGE_ACCEPTANCE_SECONDS',
        current: input.bottleneck.currentAverageSeconds,
        previous: input.bottleneck.previousAverageSeconds,
        changePercent:
          input.bottleneck.previousAverageSeconds > 0
            ? Math.round(
                (input.bottleneck.changeSeconds / input.bottleneck.previousAverageSeconds) * 1000,
              ) / 10
            : null,
        unit: 'SECONDS',
      },
      sampleSize: input.bottleneck.peakWindow?.sampleSize ?? input.currentOperationalOrders,
    });
  }

  if (
    input.previousOperationalOrders > 0 &&
    input.operationalOrdersChangePercent !== null &&
    Math.abs(input.operationalOrdersChangePercent) >=
      ADVANCED_REPORT_THRESHOLDS.minimumCommercialChangePercent
  ) {
    const growing = input.operationalOrdersChangePercent > 0;
    insights.push({
      id: 'COMMERCIAL_CHANGE',
      category: 'COMMERCIAL',
      priority: 80,
      tone: growing ? 'POSITIVE' : 'ATTENTION',
      title: growing ? 'Movimento melhor' : 'Movimento menor',
      description: `${input.currentOperationalOrders.toLocaleString('pt-BR')} pedidos, ${formatPercent(input.operationalOrdersChangePercent)}% ${growing ? 'acima' : 'abaixo'} do intervalo anterior.`,
      evidence: {
        metric: 'OPERATIONAL_ORDERS',
        current: input.currentOperationalOrders,
        previous: input.previousOperationalOrders,
        changePercent: input.operationalOrdersChangePercent,
        unit: 'ORDERS',
      },
      sampleSize: input.currentOperationalOrders,
    });
  }

  const productMovement = input.productMovements[0];
  if (productMovement) {
    const growing = productMovement.direction !== 'DOWN';
    insights.push({
      id: growing ? 'PRODUCT_GROWTH' : 'PRODUCT_DECLINE',
      category: 'PRODUCT',
      priority: 60,
      tone: growing ? 'POSITIVE' : 'ATTENTION',
      title:
        productMovement.direction === 'NEW'
          ? 'Produto novo no período'
          : growing
            ? 'Produto em alta'
            : 'Produto perdeu força',
      description:
        productMovement.direction === 'NEW'
          ? `${productMovement.name} apareceu com ${productMovement.currentQuantity.toLocaleString('pt-BR')} unidades.`
          : `${productMovement.name} vendeu ${productMovement.currentQuantity.toLocaleString('pt-BR')} unidades e ficou ${formatPercent(productMovement.changePercent ?? 0)}% ${growing ? 'acima' : 'abaixo'} do intervalo anterior.`,
      evidence: {
        metric: 'PRODUCT_QUANTITY',
        current: productMovement.currentQuantity,
        previous: productMovement.previousQuantity,
        changePercent: productMovement.changePercent,
        unit: 'UNITS',
      },
      sampleSize: productMovement.currentQuantity + productMovement.previousQuantity,
    });
  }

  const dominantModality = [...input.modalities].sort(
    (left, right) => right.sharePercent - left.sharePercent,
  )[0];
  if (
    dominantModality &&
    dominantModality.orderCount >= ADVANCED_REPORT_THRESHOLDS.minimumInsightOrders &&
    dominantModality.sharePercent >= ADVANCED_REPORT_THRESHOLDS.minimumDominantModalitySharePercent
  ) {
    insights.push({
      id: 'MODALITY_MIX',
      category: 'MODALITY',
      priority: 35,
      tone: 'NEUTRAL',
      title: `${dominantModality.label} concentrou os pedidos`,
      description: `${formatPercent(dominantModality.sharePercent)}% dos pedidos do período foram de ${dominantModality.label.toLowerCase()}.`,
      evidence: {
        metric: 'MODALITY_SHARE',
        current: dominantModality.sharePercent,
        previous: null,
        changePercent: null,
        unit: 'PERCENT',
      },
      sampleSize: input.currentOperationalOrders,
    });
  }

  if (
    input.peakHour &&
    input.peakHour.sharePercent >= ADVANCED_REPORT_THRESHOLDS.minimumPeakHourSharePercent
  ) {
    insights.push({
      id: 'PEAK_HOUR',
      category: 'OPERATION',
      priority: 25,
      tone: 'NEUTRAL',
      title: 'Horário mais forte',
      description: `${input.peakHour.label} concentrou ${formatPercent(input.peakHour.sharePercent)}% dos pedidos do período.`,
      evidence: {
        metric: 'PEAK_HOUR_ORDERS',
        current: input.peakHour.orderCount,
        previous: null,
        changePercent: null,
        unit: 'ORDERS',
      },
      sampleSize: input.currentOperationalOrders,
    });
  }

  return insights
    .sort((left, right) => right.priority - left.priority || left.id.localeCompare(right.id))
    .slice(0, ADVANCED_REPORT_THRESHOLDS.maximumVisibleInsights);
}

export const REPORT_PERIOD_PRESETS = ['TODAY', 'LAST_7_DAYS', 'LAST_30_DAYS', 'CUSTOM'] as const;

export type ReportPeriodPreset = (typeof REPORT_PERIOD_PRESETS)[number];

export type ReportsPeriodInput =
  | { preset: Exclude<ReportPeriodPreset, 'CUSTOM'> }
  | { preset: 'CUSTOM'; startLocalDate: string; endLocalDate: string };

export type ReportSeriesGranularity = 'HOUR' | 'DAY' | 'WEEK';

export interface ReportMetricComparison {
  direction: 'UP' | 'DOWN' | 'STABLE' | 'NO_BASE';
  changePercent: number | null;
  label: string;
}

export interface ReportDurationComparison {
  direction: 'FASTER' | 'SLOWER' | 'STABLE' | 'NO_BASE';
  changeSeconds: number | null;
  changePercent: number | null;
  label: string;
}

export type ReportProductMovementDirection = 'UP' | 'DOWN' | 'NEW';

export type AdvancedReportInsightCategory =
  'COMMERCIAL' | 'PRODUCT' | 'OPERATION' | 'CUSTOMER' | 'MODALITY';

export interface AdvancedReportInsight {
  id:
    | 'PREPARATION_BOTTLENECK'
    | 'ACCEPTANCE_CHANGE'
    | 'COMMERCIAL_CHANGE'
    | 'PRODUCT_GROWTH'
    | 'PRODUCT_DECLINE'
    | 'MODALITY_MIX'
    | 'PEAK_HOUR';
  category: AdvancedReportInsightCategory;
  priority: number;
  tone: 'POSITIVE' | 'ATTENTION' | 'NEUTRAL';
  title: string;
  description: string;
  evidence: {
    metric:
      | 'OPERATIONAL_ORDERS'
      | 'PRODUCT_QUANTITY'
      | 'AVERAGE_ACCEPTANCE_SECONDS'
      | 'AVERAGE_PREPARATION_SECONDS'
      | 'MODALITY_SHARE'
      | 'PEAK_HOUR_ORDERS';
    current: number;
    previous: number | null;
    changePercent: number | null;
    unit: 'ORDERS' | 'UNITS' | 'SECONDS' | 'PERCENT';
  };
  sampleSize: number;
}

export interface AdvancedReportsDTO {
  period: {
    preset: ReportPeriodPreset;
    label: string;
    comparisonLabel: string;
    startLocalDate: string;
    endLocalDate: string;
    timeZone: string;
    granularity: ReportSeriesGranularity;
  };
  summary: {
    completedValueCents: number;
    operationalOrders: number;
    completedPaidOrders: number;
    averageTicketCents: number;
    cancelledOrders: number;
    cancelledRatePercent: number;
    comparisons: {
      completedValue: ReportMetricComparison;
      operationalOrders: ReportMetricComparison;
      averageTicket: ReportMetricComparison;
      cancelledOrders: ReportMetricComparison;
    };
  };
  trend: {
    direction: 'GROWING' | 'DECLINING' | 'STABLE' | 'INSUFFICIENT';
    label: string;
    description: string;
    sampleSize: number;
  };
  series: Array<{
    key: string;
    label: string;
    fullLabel: string;
    orderCount: number;
    completedValueCents: number;
  }>;
  products: {
    top: Array<{
      productId: string;
      name: string;
      quantity: number;
    }>;
    movements: Array<{
      productId: string;
      name: string;
      currentQuantity: number;
      previousQuantity: number;
      direction: ReportProductMovementDirection;
      changePercent: number | null;
      label: string;
    }>;
  };
  hours: {
    peak: {
      startHour: number;
      endHour: number;
      label: string;
      orderCount: number;
      sharePercent: number;
    } | null;
    quiet: {
      startHour: number;
      endHour: number;
      label: string;
      orderCount: number;
      sharePercent: number;
    } | null;
    strongestWeekday: {
      weekday: number;
      label: string;
      orderCount: number;
      sharePercent: number;
    } | null;
  };
  operation: {
    averageAcceptanceSeconds: number | null;
    acceptanceSampleSize: number;
    acceptanceComparison: ReportDurationComparison;
    averagePreparationSeconds: number | null;
    preparationSampleSize: number;
    preparationComparison: ReportDurationComparison;
    bottleneck: {
      stage: 'ACCEPTANCE' | 'PREPARATION';
      title: string;
      description: string;
      currentAverageSeconds: number;
      previousAverageSeconds: number;
      changeSeconds: number;
      peakWindow: {
        label: string;
        averageSeconds: number;
        sampleSize: number;
      } | null;
    } | null;
    sla: {
      attentionOrders: number;
      criticalOrders: number;
      comparison: ReportMetricComparison;
    } | null;
  };
  modalities: Array<{
    modality: 'DELIVERY' | 'PICKUP' | 'DINE_IN';
    label: string;
    orderCount: number;
    sharePercent: number;
    completedPaidOrders: number;
    averageTicketCents: number;
    cancelledOrders: number;
    cancelledRatePercent: number;
  }>;
  insights: AdvancedReportInsight[];
  intelligenceState: 'READY' | 'INSUFFICIENT';
}

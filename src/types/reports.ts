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
  series: Array<{
    key: string;
    label: string;
    fullLabel: string;
    orderCount: number;
    completedValueCents: number;
  }>;
  products: Array<{
    productId: string;
    name: string;
    quantity: number;
  }>;
  peakHour: {
    hour: number;
    label: string;
    orderCount: number;
    sharePercent: number;
  } | null;
  operation: {
    averageAcceptanceSeconds: number | null;
    acceptanceSampleSize: number;
    averagePreparationSeconds: number | null;
    preparationSampleSize: number;
    attentionAlertsCount: number | null;
  };
  modalities: Array<{
    modality: 'DELIVERY' | 'PICKUP';
    label: string;
    orderCount: number;
    sharePercent: number;
  }>;
  insights: Array<{
    id: 'PEAK_HOUR' | 'TOP_PRODUCT' | 'ACCEPTANCE_CHANGE';
    text: string;
  }>;
  insightsMinimumSample: number;
  hasEnoughDataForInsights: boolean;
}

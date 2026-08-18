'use client';

import { useMemo, useState, useTransition } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CalendarRange,
  CircleMinus,
  PackageOpen,
  Plus,
  RefreshCw,
  Sparkles,
  Star,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { getAdvancedReportsAction } from '@/features/reports/actions';
import { cn, formatCurrency } from '@/lib/utils';
import type {
  AdvancedReportInsight,
  AdvancedReportsDTO,
  ReportDurationComparison,
  ReportMetricComparison,
  ReportPeriodPreset,
  ReportsPeriodInput,
} from '@/types/reports';

const PERIOD_OPTIONS: Array<{ preset: Exclude<ReportPeriodPreset, 'CUSTOM'>; label: string }> = [
  { preset: 'TODAY', label: 'Hoje' },
  { preset: 'LAST_7_DAYS', label: '7 dias' },
  { preset: 'LAST_30_DAYS', label: '30 dias' },
];

function formatInteger(value: number) {
  return value.toLocaleString('pt-BR');
}

function formatPercent(value: number) {
  return `${value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
}

function formatDuration(seconds: number | null) {
  if (seconds === null) return 'Sem dados';
  if (seconds < 60) return `${seconds}s`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  if (hours > 0) {
    const minutesWithinHour = minutes % 60;
    return `${hours}h ${String(minutesWithinHour).padStart(2, '0')}min ${String(remaining).padStart(2, '0')}s`;
  }
  return remaining > 0 ? `${minutes}min ${String(remaining).padStart(2, '0')}s` : `${minutes}min`;
}

function Comparison({ comparison }: { comparison: ReportMetricComparison }) {
  const Icon =
    comparison.direction === 'UP'
      ? ArrowUpRight
      : comparison.direction === 'DOWN'
        ? ArrowDownRight
        : CircleMinus;
  return (
    <p className="text-text-secondary mt-2 flex min-h-8 items-start gap-1.5 text-xs leading-5">
      <Icon
        className={cn(
          'mt-0.5 h-3.5 w-3.5 shrink-0',
          comparison.direction === 'UP' && 'text-success',
          comparison.direction === 'DOWN' && 'text-info',
        )}
        aria-hidden="true"
      />
      <span>{comparison.label}</span>
    </p>
  );
}

function ReportsHeader({
  data,
  isPending,
  onSelectPeriod,
}: {
  data: AdvancedReportsDTO;
  isPending: boolean;
  onSelectPeriod: (input: ReportsPeriodInput) => void;
}) {
  const [customOpen, setCustomOpen] = useState(data.period.preset === 'CUSTOM');
  const [startLocalDate, setStartLocalDate] = useState(data.period.startLocalDate);
  const [endLocalDate, setEndLocalDate] = useState(data.period.endLocalDate);

  return (
    <header className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
      <div className="max-w-2xl">
        <h1 className="font-display text-text-primary text-3xl font-bold tracking-[-0.035em] text-balance sm:text-4xl">
          O que mudou na sua loja
        </h1>
        <p className="text-text-secondary mt-2 max-w-xl text-sm leading-6 sm:text-base">
          Entenda o resultado, os produtos e a operação — e saiba o que merece atenção.
        </p>
      </div>

      <div className="flex min-w-0 flex-col gap-2 xl:items-end">
        <p className="text-text-secondary text-xs font-medium" aria-live="polite">
          {isPending
            ? 'Atualizando relatório…'
            : `${data.period.label} · comparado a ${data.period.comparisonLabel.toLowerCase()}`}
        </p>
        <div
          role="group"
          aria-label="Período do relatório"
          className="border-border bg-surface flex max-w-full gap-1 overflow-x-auto rounded-xl border p-1"
        >
          {PERIOD_OPTIONS.map((option) => (
            <button
              key={option.preset}
              type="button"
              disabled={isPending}
              aria-pressed={data.period.preset === option.preset}
              onClick={() => {
                setCustomOpen(false);
                onSelectPeriod({ preset: option.preset });
              }}
              className={cn(
                'focus-visible:ring-brand-500 min-h-11 shrink-0 rounded-lg px-3 text-sm font-semibold focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-wait disabled:opacity-60',
                data.period.preset === option.preset
                  ? 'bg-brand-600 text-white'
                  : 'text-text-secondary hover:bg-surface-secondary hover:text-text-primary',
              )}
            >
              {option.label}
            </button>
          ))}
          <button
            type="button"
            disabled={isPending}
            aria-expanded={customOpen}
            aria-controls="reports-custom-period"
            aria-pressed={data.period.preset === 'CUSTOM'}
            onClick={() => setCustomOpen((open) => !open)}
            className={cn(
              'focus-visible:ring-brand-500 flex min-h-11 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-semibold focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-wait disabled:opacity-60',
              data.period.preset === 'CUSTOM'
                ? 'bg-brand-600 text-white'
                : 'text-text-secondary hover:bg-surface-secondary hover:text-text-primary',
            )}
          >
            <CalendarRange className="h-4 w-4" aria-hidden="true" />
            Personalizado
          </button>
        </div>
      </div>

      {customOpen ? (
        <form
          id="reports-custom-period"
          className="bg-kraft/70 grid gap-3 rounded-xl p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end xl:col-span-2"
          onSubmit={(event) => {
            event.preventDefault();
            setCustomOpen(false);
            onSelectPeriod({ preset: 'CUSTOM', startLocalDate, endLocalDate });
          }}
        >
          <label className="text-tinta text-sm font-medium">
            Data inicial
            <input
              type="date"
              required
              value={startLocalDate}
              max={endLocalDate}
              onChange={(event) => setStartLocalDate(event.target.value)}
              className="border-border bg-surface text-text-primary focus-visible:ring-brand-500 mt-1 block h-11 w-full rounded-lg border px-3 text-base focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
            />
          </label>
          <label className="text-tinta text-sm font-medium">
            Data final
            <input
              type="date"
              required
              value={endLocalDate}
              min={startLocalDate}
              onChange={(event) => setEndLocalDate(event.target.value)}
              className="border-border bg-surface text-text-primary focus-visible:ring-brand-500 mt-1 block h-11 w-full rounded-lg border px-3 text-base focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
            />
          </label>
          <Button type="submit" disabled={isPending} className="min-h-11">
            Aplicar período
          </Button>
          <p className="text-tinta/75 text-xs sm:col-span-3">
            Consulte no máximo 365 dias por vez.
          </p>
        </form>
      ) : null}
    </header>
  );
}

function KpiBand({ data }: { data: AdvancedReportsDTO }) {
  const metrics = [
    {
      label: 'Valor em pedidos concluídos',
      value: formatCurrency(data.summary.completedValueCents),
      detail: `${formatInteger(data.summary.completedPaidOrders)} concluídos e pagos`,
      comparison: data.summary.comparisons.completedValue,
    },
    {
      label: 'Pedidos',
      value: formatInteger(data.summary.operationalOrders),
      detail: 'que entraram em operação',
      comparison: data.summary.comparisons.operationalOrders,
    },
    {
      label: 'Ticket médio',
      value: formatCurrency(data.summary.averageTicketCents),
      detail: 'por pedido concluído e pago',
      comparison: data.summary.comparisons.averageTicket,
    },
    {
      label: 'Cancelamentos',
      value: formatInteger(data.summary.cancelledOrders),
      detail: `${formatPercent(data.summary.cancelledRatePercent)} dos pedidos`,
      comparison: data.summary.comparisons.cancelledOrders,
    },
  ];

  return (
    <section aria-labelledby="reports-summary-title" className="mt-8">
      <h2 id="reports-summary-title" className="sr-only">
        Resumo do período
      </h2>
      <div className="border-border bg-surface grid overflow-hidden rounded-2xl border sm:grid-cols-2 xl:grid-cols-[1.35fr_repeat(3,1fr)]">
        {metrics.map((metric, index) => (
          <div
            key={metric.label}
            className={cn(
              'min-w-0 p-4 sm:p-5',
              index > 0 && 'border-border border-t',
              index === 1 && 'sm:border-t-0 sm:border-l',
              index === 2 && 'xl:border-t-0 xl:border-l',
              index === 3 && 'sm:border-l xl:border-t-0',
            )}
          >
            <h3 className="text-text-secondary min-h-10 text-sm font-medium">{metric.label}</h3>
            <p className="text-text-primary mt-1 font-mono text-2xl font-bold tracking-[-0.03em] sm:text-3xl">
              {metric.value}
            </p>
            <p className="text-text-secondary mt-1 text-xs leading-5">{metric.detail}</p>
            <Comparison comparison={metric.comparison} />
          </div>
        ))}
      </div>
    </section>
  );
}

function InsightIcon({ insight }: { insight: AdvancedReportInsight }) {
  if (insight.tone === 'ATTENTION') return <AlertTriangle aria-hidden="true" />;
  if (insight.category === 'PRODUCT') return <Star aria-hidden="true" />;
  return <TrendingUp aria-hidden="true" />;
}

function Highlights({ data }: { data: AdvancedReportsDTO }) {
  return (
    <section
      aria-labelledby="reports-highlights-title"
      className="bg-kraft mt-8 rounded-2xl p-5 sm:p-6"
    >
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <h2 id="reports-highlights-title" className="font-display text-tinta text-xl font-bold">
          Destaques do período
        </h2>
        <p className="text-tinta/75 text-sm">O que mais merece sua atenção</p>
      </div>
      {data.intelligenceState === 'READY' && data.insights.length > 0 ? (
        <ul className="mt-4 grid lg:grid-cols-3">
          {data.insights.map((insight, index) => (
            <li
              key={insight.id}
              className={cn(
                'grid min-w-0 grid-cols-[2.25rem_minmax(0,1fr)] gap-3 py-4 lg:px-5 lg:py-0',
                index > 0 && 'border-tinta/15 border-t lg:border-t-0 lg:border-l',
                index === 0 && 'pt-0 lg:pl-0',
                index === data.insights.length - 1 && 'pb-0 lg:pr-0',
              )}
            >
              <span className="bg-papel/75 text-tinta flex h-9 w-9 items-center justify-center rounded-lg [&>svg]:h-4.5 [&>svg]:w-4.5">
                <InsightIcon insight={insight} />
              </span>
              <div className="min-w-0">
                <h3 className="font-display text-tinta text-base font-bold">{insight.title}</h3>
                <p className="text-tinta/80 mt-1 text-sm leading-6">{insight.description}</p>
                {index === 0 && data.operation.bottleneck ? (
                  <a
                    href="#reports-operation"
                    className="text-brand-800 focus-visible:ring-brand-500 mt-2 inline-flex min-h-11 items-center gap-1 text-sm font-semibold underline decoration-1 underline-offset-4 focus-visible:rounded focus-visible:ring-2 focus-visible:outline-none"
                  >
                    Ver onde o tempo mudou <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </a>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-5 flex gap-3">
          <Sparkles className="text-tinta/70 mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <div>
            <h3 className="font-display text-tinta text-base font-bold">
              Ainda não há dados suficientes para comparar
            </h3>
            <p className="text-tinta/75 mt-1 max-w-2xl text-sm leading-6">
              Os números atuais continuam disponíveis. Tendências e destaques aparecerão quando
              houver uma base segura nos dois intervalos.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

function MovementChart({ data }: { data: AdvancedReportsDTO }) {
  const maxOrders = Math.max(1, ...data.series.map((item) => item.orderCount));
  const width = 720;
  const plotTop = 22;
  const plotBottom = 185;
  const plotHeight = plotBottom - plotTop;
  const spacing = data.series.length > 1 ? width / (data.series.length - 1) : width / 2;
  const points = data.series
    .map((item, index) => {
      const x = data.series.length > 1 ? index * spacing : width / 2;
      const y = plotBottom - (item.orderCount / maxOrders) * plotHeight;
      return `${x},${y}`;
    })
    .join(' ');
  const labelEvery = Math.max(1, Math.ceil(data.series.length / 6));
  const TrendIcon =
    data.trend.direction === 'GROWING'
      ? TrendingUp
      : data.trend.direction === 'DECLINING'
        ? TrendingDown
        : CircleMinus;

  return (
    <div className="border-border bg-surface min-w-0 rounded-2xl border p-4 sm:p-5">
      <div
        className={cn(
          'flex items-center gap-2 text-sm font-semibold',
          data.trend.direction === 'GROWING' && 'text-success',
          data.trend.direction === 'DECLINING' && 'text-error',
          ['STABLE', 'INSUFFICIENT'].includes(data.trend.direction) && 'text-text-secondary',
        )}
      >
        <TrendIcon className="h-4 w-4" aria-hidden="true" /> {data.trend.label}
      </div>
      <p className="text-text-secondary mt-2 text-sm leading-6">{data.trend.description}</p>

      <div className="mt-4 hidden sm:block" aria-hidden="true">
        <svg viewBox={`0 0 ${width} 225`} className="h-auto w-full overflow-visible">
          {[0, 0.5, 1].map((ratio) => {
            const y = plotBottom - ratio * plotHeight;
            return (
              <line
                key={ratio}
                x1="0"
                x2={width}
                y1={y}
                y2={y}
                className="stroke-border"
                strokeDasharray={ratio === 0 ? undefined : '4 6'}
              />
            );
          })}
          <polyline
            points={points}
            fill="none"
            className="stroke-brand-700"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {data.series.map((item, index) => {
            const x = data.series.length > 1 ? index * spacing : width / 2;
            const y = plotBottom - (item.orderCount / maxOrders) * plotHeight;
            return (
              <g key={item.key}>
                <circle
                  cx={x}
                  cy={y}
                  r="5"
                  className="fill-surface stroke-brand-700"
                  strokeWidth="3"
                />
                {(index % labelEvery === 0 || index === data.series.length - 1) && (
                  <text
                    x={x}
                    y="216"
                    textAnchor={
                      index === 0 ? 'start' : index === data.series.length - 1 ? 'end' : 'middle'
                    }
                    className="fill-text-secondary text-xs"
                  >
                    {item.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      <div className="mt-5 space-y-3 sm:hidden" aria-hidden="true">
        {data.series.map((item) => (
          <div
            key={item.key}
            className="grid grid-cols-[4.75rem_minmax(0,1fr)_2rem] items-center gap-2"
          >
            <span className="text-text-secondary text-xs leading-4">{item.label}</span>
            <span className="bg-surface-tertiary h-2.5 overflow-hidden rounded-full">
              <span
                className="bg-brand-700 block h-full min-w-1 rounded-full"
                style={{ width: `${Math.max(3, (item.orderCount / maxOrders) * 100)}%` }}
              />
            </span>
            <span className="text-text-primary text-right font-mono text-xs font-bold">
              {item.orderCount}
            </span>
          </div>
        ))}
      </div>

      <details className="border-border mt-5 border-t pt-1">
        <summary className="text-brand-800 focus-visible:ring-brand-500 inline-flex min-h-11 cursor-pointer items-center rounded-lg text-sm font-semibold focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none">
          Ver dados do gráfico
        </summary>
        <table className="mt-2 w-full text-left text-sm">
          <caption className="sr-only">Pedidos por intervalo</caption>
          <thead className="text-text-secondary">
            <tr>
              <th scope="col" className="border-border border-b px-2 py-2 font-semibold">
                Intervalo
              </th>
              <th scope="col" className="border-border border-b px-2 py-2 text-right font-semibold">
                Pedidos
              </th>
            </tr>
          </thead>
          <tbody>
            {data.series.map((item) => (
              <tr key={item.key}>
                <th scope="row" className="border-border border-b px-2 py-2 font-medium">
                  {item.fullLabel}
                </th>
                <td className="border-border border-b px-2 py-2 text-right font-mono">
                  {formatInteger(item.orderCount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

function ProductsPanel({ data }: { data: AdvancedReportsDTO }) {
  return (
    <div className="border-border min-w-0 border-t xl:border-t-0">
      <div>
        <h3 className="font-display text-text-primary py-3 text-base font-bold">Mais vendidos</h3>
        {data.products.top.length > 0 ? (
          <ol>
            {data.products.top.slice(0, 3).map((product, index) => (
              <li
                key={product.productId}
                className="border-border grid min-h-12 grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-2 border-t"
              >
                <span className="text-text-secondary font-mono text-xs">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span className="text-text-primary min-w-0 truncate text-sm font-semibold">
                  {product.name}
                </span>
                <span className="text-text-primary font-mono text-xs font-bold">
                  {formatInteger(product.quantity)} un.
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-text-secondary border-border border-t py-4 text-sm">
            Nenhum produto concluído no período.
          </p>
        )}
      </div>

      <div className="mt-3">
        <h3 className="font-display text-text-primary py-3 text-base font-bold">Em movimento</h3>
        {data.products.movements.length > 0 ? (
          <ul>
            {data.products.movements.map((product) => {
              const Icon =
                product.direction === 'UP'
                  ? TrendingUp
                  : product.direction === 'DOWN'
                    ? TrendingDown
                    : Plus;
              return (
                <li
                  key={product.productId}
                  className="border-border grid min-h-12 grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-2 border-t"
                >
                  <Icon
                    className={cn(
                      'h-4 w-4',
                      product.direction === 'UP' && 'text-success',
                      product.direction === 'DOWN' && 'text-error',
                      product.direction === 'NEW' && 'text-info',
                    )}
                    aria-hidden="true"
                  />
                  <span className="text-text-primary min-w-0 truncate text-sm font-semibold">
                    {product.name}
                  </span>
                  <span
                    className={cn(
                      'font-mono text-xs font-bold',
                      product.direction === 'UP' && 'text-success',
                      product.direction === 'DOWN' && 'text-error',
                      product.direction === 'NEW' && 'text-info',
                    )}
                  >
                    {product.label}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-text-secondary border-border border-t py-4 text-sm">
            Nenhuma mudança de produto passou pela amostra mínima.
          </p>
        )}
      </div>
    </div>
  );
}

function TrendAndProducts({ data }: { data: AdvancedReportsDTO }) {
  return (
    <section aria-labelledby="reports-trend-title" className="mt-8">
      <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <h2 id="reports-trend-title" className="font-display text-text-primary text-2xl font-bold">
          Tendência e produtos
        </h2>
        <p className="text-text-secondary text-sm">Histórico, não previsão</p>
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(17rem,.55fr)]">
        <MovementChart data={data} />
        <ProductsPanel data={data} />
      </div>
    </section>
  );
}

function DurationDelta({ comparison }: { comparison: ReportDurationComparison }) {
  const Icon = comparison.direction === 'FASTER' ? ArrowDownRight : ArrowUpRight;
  if (comparison.direction === 'NO_BASE' || comparison.direction === 'STABLE') {
    return <span className="text-text-secondary text-xs">{comparison.label}</span>;
  }
  return (
    <span className="text-text-secondary flex items-center gap-1 text-xs">
      <Icon
        className={cn(
          'h-3.5 w-3.5',
          comparison.direction === 'FASTER' ? 'text-success' : 'text-warning',
        )}
        aria-hidden="true"
      />
      {comparison.label}
    </span>
  );
}

function OperationSection({ data }: { data: AdvancedReportsDTO }) {
  const timing = [
    data.hours.peak
      ? {
          label: 'Pico de pedidos',
          value: data.hours.peak.label,
          detail: `${formatPercent(data.hours.peak.sharePercent)} dos pedidos do período`,
        }
      : null,
    data.hours.quiet
      ? {
          label: 'Horário mais tranquilo',
          value: data.hours.quiet.label,
          detail: `${formatPercent(data.hours.quiet.sharePercent)} dos pedidos do período`,
        }
      : null,
    data.hours.strongestWeekday
      ? {
          label: 'Momento mais forte',
          value: data.hours.strongestWeekday.label,
          detail: 'Período com pelo menos quatro semanas',
        }
      : null,
  ].filter(Boolean);

  return (
    <section id="reports-operation" aria-labelledby="reports-operation-title" className="mt-9">
      <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <h2
          id="reports-operation-title"
          className="font-display text-text-primary text-2xl font-bold"
        >
          Operação
        </h2>
        <p className="text-text-secondary text-sm">Onde o tempo mudou</p>
      </div>
      <div className="grid gap-5 lg:grid-cols-[1.1fr_.9fr]">
        <div className="border-border border-t pt-3">
          <dl>
            <div className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 py-3">
              <dt className="text-text-primary text-sm font-semibold">Tempo para aceitar</dt>
              <dd className="text-text-primary font-mono text-sm font-bold">
                {formatDuration(data.operation.averageAcceptanceSeconds)}
              </dd>
              <dd className="col-span-2">
                <DurationDelta comparison={data.operation.acceptanceComparison} />
              </dd>
            </div>
            <div className="border-border grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 border-t py-3">
              <dt className="text-text-primary text-sm font-semibold">Tempo de preparo</dt>
              <dd className="text-text-primary font-mono text-sm font-bold">
                {formatDuration(data.operation.averagePreparationSeconds)}
              </dd>
              <dd className="col-span-2">
                <DurationDelta comparison={data.operation.preparationComparison} />
              </dd>
            </div>
          </dl>

          {data.operation.bottleneck ? (
            <div className="bg-warning-light text-warning mt-2 flex gap-3 rounded-xl p-4 text-sm leading-6">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
              <p>
                <strong>{data.operation.bottleneck.title}</strong>
                <br />
                {data.operation.bottleneck.description}
              </p>
            </div>
          ) : null}

          {data.operation.sla ? (
            <div className="mt-3">
              <dl>
                <div className="flex min-h-11 items-center justify-between gap-4 text-sm">
                  <dt className="text-text-secondary">Pedidos em Atenção no período</dt>
                  <dd className="text-text-primary font-mono font-bold">
                    {formatInteger(data.operation.sla.attentionOrders)}
                  </dd>
                </div>
                <div className="flex min-h-11 items-center justify-between gap-4 text-sm">
                  <dt className="text-text-secondary">Chegaram a Crítico no período</dt>
                  <dd className="text-text-primary font-mono font-bold">
                    {formatInteger(data.operation.sla.criticalOrders)}
                  </dd>
                </div>
              </dl>
              <p className="text-text-secondary text-xs">
                {data.operation.sla.comparison.label}
              </p>
            </div>
          ) : null}
        </div>

        <div className="border-border border-t pt-3">
          {timing.length > 0 ? (
            <dl>
              {timing.map((item) =>
                item ? (
                  <div
                    key={item.label}
                    className="border-border grid min-h-16 grid-cols-[1fr_auto] content-center gap-x-3 border-b py-2"
                  >
                    <dt className="text-text-secondary text-sm">{item.label}</dt>
                    <dd className="text-text-primary text-right text-sm font-bold">{item.value}</dd>
                    <dd className="text-text-secondary col-span-2 text-xs">{item.detail}</dd>
                  </div>
                ) : null,
              )}
            </dl>
          ) : (
            <p className="text-text-secondary py-4 text-sm">
              Ainda não há amostra horária suficiente para apontar um padrão.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function ModalitiesSection({ data }: { data: AdvancedReportsDTO }) {
  const [delivery, pickup] = data.modalities;
  const ticketDifference = Math.abs(
    (delivery?.averageTicketCents ?? 0) - (pickup?.averageTicketCents ?? 0),
  );
  const dominant = [...data.modalities].sort(
    (left, right) => right.sharePercent - left.sharePercent,
  )[0];

  return (
    <section
      aria-labelledby="reports-modalities-title"
      className="border-border mt-9 border-t pt-7"
    >
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <h2
          id="reports-modalities-title"
          className="font-display text-text-primary text-2xl font-bold"
        >
          Entrega ou retirada
        </h2>
        <p className="text-text-secondary text-sm">Uma comparação direta</p>
      </div>
      {dominant ? (
        <p className="text-text-secondary mt-3 text-sm leading-6">
          {dominant.label} representou {formatPercent(dominant.sharePercent)} dos pedidos
          {delivery && pickup && ticketDifference > 0
            ? `; a diferença de ticket médio foi ${formatCurrency(ticketDifference)}.`
            : '.'}
        </p>
      ) : null}

      <div
        role="table"
        aria-label="Comparação por modalidade"
        className="border-border bg-surface mt-4 overflow-hidden rounded-2xl border"
      >
        <div
          role="row"
          className="bg-surface-secondary text-text-secondary hidden min-h-11 grid-cols-[1.3fr_repeat(3,1fr)] items-center text-xs font-semibold sm:grid"
        >
          <span role="columnheader" className="px-4 py-3">
            Modalidade
          </span>
          <span role="columnheader" className="border-border border-l px-4 py-3">
            Pedidos
          </span>
          <span role="columnheader" className="border-border border-l px-4 py-3">
            Participação
          </span>
          <span role="columnheader" className="border-border border-l px-4 py-3">
            Ticket médio
          </span>
        </div>
        {data.modalities.map((modality) => (
          <div
            key={modality.modality}
            role="row"
            className="border-border grid grid-cols-3 border-t first:border-t-0 sm:min-h-14 sm:grid-cols-[1.3fr_repeat(3,1fr)] sm:items-center"
          >
            <strong
              role="cell"
              className="bg-surface-secondary text-text-primary col-span-3 px-3 py-2 text-sm sm:col-span-1 sm:bg-transparent sm:px-4 sm:py-3"
            >
              {modality.label}
            </strong>
            <span role="cell" className="px-3 py-3 text-xs sm:border-l sm:px-4">
              <span className="text-text-secondary block text-xs sm:hidden">Pedidos</span>
              <span className="text-text-primary font-mono font-bold">
                {formatInteger(modality.orderCount)}
              </span>
            </span>
            <span role="cell" className="border-border border-l px-3 py-3 text-xs sm:px-4">
              <span className="text-text-secondary block text-xs sm:hidden">Participação</span>
              <span className="text-text-primary font-mono font-bold">
                {formatPercent(modality.sharePercent)}
              </span>
            </span>
            <span role="cell" className="border-border border-l px-3 py-3 text-xs sm:px-4">
              <span className="text-text-secondary block text-xs sm:hidden">Ticket médio</span>
              <span className="text-text-primary font-mono font-bold">
                {formatCurrency(modality.averageTicketCents)}
              </span>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function ReportsEmptyState({ periodLabel }: { periodLabel: string }) {
  return (
    <section className="border-border bg-surface mt-8 rounded-2xl border px-5 py-12 text-center sm:px-8">
      <PackageOpen className="text-text-muted mx-auto h-10 w-10" aria-hidden="true" />
      <h2 className="font-display text-text-primary mt-4 text-xl font-bold">
        Ainda estamos conhecendo sua operação
      </h2>
      <p className="text-text-secondary mx-auto mt-2 max-w-md text-sm leading-6">
        Não encontramos pedidos operacionais em {periodLabel.toLowerCase()}. Quando houver mais
        pedidos, tendências e destaques aparecerão aqui automaticamente.
      </p>
    </section>
  );
}

export function ReportsLoadingState() {
  return (
    <div
      className="mx-auto w-full max-w-7xl animate-pulse"
      aria-label="Carregando relatórios"
      role="status"
    >
      <div className="bg-surface-tertiary h-10 w-full max-w-lg rounded-lg" />
      <div className="bg-surface-tertiary mt-3 h-5 w-full max-w-2xl rounded" />
      <div className="border-border mt-8 grid overflow-hidden rounded-2xl border sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="border-border h-36 border-b p-5 last:border-b-0 sm:border-r">
            <div className="bg-surface-tertiary h-4 w-2/3 rounded" />
            <div className="bg-surface-tertiary mt-4 h-8 w-1/2 rounded" />
          </div>
        ))}
      </div>
      <div className="bg-kraft/70 mt-8 h-36 rounded-2xl" />
      <div className="bg-surface-tertiary mt-8 h-72 rounded-2xl" />
      <span className="sr-only">Carregando relatórios…</span>
    </div>
  );
}

export function ReportsErrorState({
  message,
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <section className="border-border bg-surface mx-auto w-full max-w-3xl rounded-2xl border px-5 py-12 text-center sm:px-8">
      <AlertCircle className="text-error mx-auto h-10 w-10" aria-hidden="true" />
      <h1 className="font-display text-text-primary mt-4 text-xl font-bold">
        Não foi possível carregar os relatórios
      </h1>
      <p className="text-text-secondary mx-auto mt-2 max-w-lg text-sm leading-6">
        {message ?? 'Seus pedidos continuam seguros. Volte ao painel e tente novamente mais tarde.'}
      </p>
      {onRetry ? (
        <Button className="mt-6 min-h-11" onClick={onRetry}>
          Tentar novamente
        </Button>
      ) : null}
    </section>
  );
}

function InlineError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      className="border-error/25 bg-error-light text-text-primary mt-6 flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between"
      role="alert"
    >
      <div className="flex gap-3">
        <AlertCircle className="text-error mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        <div>
          <p className="text-sm font-semibold">Não foi possível atualizar este período</p>
          <p className="text-text-secondary mt-1 text-sm">
            {message} Os dados anteriores continuam visíveis.
          </p>
        </div>
      </div>
      <Button type="button" variant="outline" className="min-h-11 shrink-0" onClick={onRetry}>
        <RefreshCw className="h-4 w-4" aria-hidden="true" /> Tentar novamente
      </Button>
    </div>
  );
}

export function ReportsDashboard({ initialData }: { initialData: AdvancedReportsDTO }) {
  const [data, setData] = useState(initialData);
  const [lastInput, setLastInput] = useState<ReportsPeriodInput>(
    initialData.period.preset === 'CUSTOM'
      ? {
          preset: 'CUSTOM',
          startLocalDate: initialData.period.startLocalDate,
          endLocalDate: initialData.period.endLocalDate,
        }
      : { preset: initialData.period.preset },
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const contentKey = useMemo(
    () => `${data.period.preset}-${data.period.startLocalDate}-${data.period.endLocalDate}`,
    [data.period],
  );

  function load(input: ReportsPeriodInput) {
    setLastInput(input);
    setError(null);
    startTransition(async () => {
      const result = await getAdvancedReportsAction(input);
      if (!result.success) {
        setError(result.error.message);
        return;
      }
      setData(result.data);
    });
  }

  return (
    <div className="relative mx-auto w-full max-w-7xl" aria-busy={isPending}>
      <ReportsHeader data={data} isPending={isPending} onSelectPeriod={load} />
      {error ? <InlineError message={error} onRetry={() => load(lastInput)} /> : null}
      <div
        key={contentKey}
        className={cn('transition-opacity', isPending && 'pointer-events-none opacity-50')}
      >
        {data.summary.operationalOrders === 0 ? (
          <ReportsEmptyState periodLabel={data.period.label} />
        ) : (
          <>
            <KpiBand data={data} />
            <Highlights data={data} />
            <TrendAndProducts data={data} />
            <OperationSection data={data} />
            <ModalitiesSection data={data} />
            <details className="border-border mt-8 border-t pt-2">
              <summary className="text-text-primary focus-visible:ring-brand-500 flex min-h-11 cursor-pointer items-center justify-between gap-4 rounded-lg text-sm font-semibold focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none">
                Sobre os cálculos e dados disponíveis
                <Plus className="h-4 w-4" aria-hidden="true" />
              </summary>
              <p className="text-text-secondary mt-2 max-w-3xl text-sm leading-6">
                As comparações usam intervalos equivalentes. Tendências só aparecem com amostra e
                mudança relevantes. Produtos consideram pedidos concluídos e pagos. Recorrência de
                clientes e combinações de itens permanecem ocultas até terem cobertura e performance
                comprovadas.
              </p>
            </details>
          </>
        )}
      </div>
      {isPending ? (
        <span className="sr-only" role="status" aria-live="polite">
          Atualizando relatório
        </span>
      ) : null}
    </div>
  );
}

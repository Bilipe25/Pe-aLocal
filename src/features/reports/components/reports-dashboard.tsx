'use client';

import { useMemo, useState, useTransition } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CalendarRange,
  ChartNoAxesCombined,
  Clock3,
  PackageOpen,
  RefreshCw,
  Sparkles,
  UtensilsCrossed,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { getAdvancedReportsAction } from '@/features/reports/actions';
import { cn, formatCurrency } from '@/lib/utils';
import type {
  AdvancedReportsDTO,
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
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return remaining > 0 ? `${minutes}min ${remaining}s` : `${minutes}min`;
}

function Comparison({ comparison }: { comparison: ReportMetricComparison }) {
  return <p className="text-text-muted mt-1 text-xs leading-5">{comparison.label}</p>;
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
    <header>
      <p className="text-brand-700 text-sm font-semibold">Relatórios</p>
      <div className="mt-1 flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div className="max-w-2xl">
          <h1 className="text-text-primary text-2xl font-bold tracking-[-0.035em] sm:text-3xl">
            Entenda sua loja sem complicação
          </h1>
          <p className="text-text-secondary mt-2 max-w-xl text-sm leading-6 sm:text-base">
            Um resumo do movimento, dos produtos e da operação para ajudar nas decisões do dia a
            dia.
          </p>
        </div>

        <div className="flex flex-col gap-3 lg:items-end">
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
                  'focus-visible:ring-brand-500 min-h-11 shrink-0 rounded-lg px-3 text-sm font-semibold focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-60',
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
                'focus-visible:ring-brand-500 flex min-h-11 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-semibold focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-60',
                data.period.preset === 'CUSTOM'
                  ? 'bg-brand-600 text-white'
                  : 'text-text-secondary hover:bg-surface-secondary hover:text-text-primary',
              )}
            >
              <CalendarRange className="h-4 w-4" aria-hidden="true" />
              Personalizado
            </button>
          </div>
          <p className="text-text-secondary text-xs" aria-live="polite">
            {isPending ? 'Atualizando relatório…' : data.period.label}
          </p>
        </div>
      </div>

      {customOpen ? (
        <form
          id="reports-custom-period"
          className="border-border bg-surface mt-4 grid gap-3 rounded-xl border p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            onSelectPeriod({ preset: 'CUSTOM', startLocalDate, endLocalDate });
          }}
        >
          <label className="text-text-secondary text-sm font-medium">
            Data inicial
            <input
              type="date"
              required
              value={startLocalDate}
              max={endLocalDate}
              onChange={(event) => setStartLocalDate(event.target.value)}
              className="border-border bg-surface text-text-primary focus-visible:ring-brand-500 mt-1 block h-11 w-full rounded-lg border px-3 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
            />
          </label>
          <label className="text-text-secondary text-sm font-medium">
            Data final
            <input
              type="date"
              required
              value={endLocalDate}
              min={startLocalDate}
              onChange={(event) => setEndLocalDate(event.target.value)}
              className="border-border bg-surface text-text-primary focus-visible:ring-brand-500 mt-1 block h-11 w-full rounded-lg border px-3 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
            />
          </label>
          <Button type="submit" disabled={isPending}>
            Aplicar período
          </Button>
          <p className="text-text-muted text-xs sm:col-span-3">
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
      detail: `${formatInteger(data.summary.completedPaidOrders)} pedidos concluídos e pagos`,
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
      label: 'Cancelados',
      value: formatInteger(data.summary.cancelledOrders),
      detail: `${formatPercent(data.summary.cancelledRatePercent)} dos pedidos operacionais`,
      comparison: data.summary.comparisons.cancelledOrders,
    },
  ];

  return (
    <section aria-labelledby="reports-summary-title" className="mt-8">
      <h2 id="reports-summary-title" className="sr-only">
        Resumo do período
      </h2>
      <div className="border-border bg-surface grid overflow-hidden rounded-2xl border sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric, index) => (
          <div
            key={metric.label}
            className={cn(
              'min-w-0 p-5 sm:p-6',
              index > 0 && 'border-border border-t',
              index === 1 && 'sm:border-t-0 sm:border-l',
              index === 2 && 'xl:border-t-0 xl:border-l',
              index === 3 && 'sm:border-l xl:border-t-0',
            )}
          >
            <h3 className="text-text-secondary text-sm font-medium">{metric.label}</h3>
            <p className="text-text-primary mt-2 font-mono text-2xl font-bold tracking-[-0.03em] sm:text-3xl">
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

function Highlights({ data }: { data: AdvancedReportsDTO }) {
  return (
    <section
      aria-labelledby="reports-highlights-title"
      className="bg-kraft/65 mt-8 rounded-2xl p-5 sm:p-6"
    >
      <div className="flex items-center gap-2">
        <Sparkles className="text-tinta h-5 w-5" aria-hidden="true" />
        <h2 id="reports-highlights-title" className="text-tinta text-lg font-bold">
          Destaques do período
        </h2>
      </div>
      {data.hasEnoughDataForInsights ? (
        <ul className="mt-4 grid gap-3 lg:grid-cols-3">
          {data.insights.map((insight) => (
            <li key={insight.id} className="text-tinta/85 flex gap-3 text-sm leading-6">
              <ArrowRight className="mt-1 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{insight.text}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-tinta/75 mt-3 max-w-2xl text-sm leading-6">
          Ainda não há amostra suficiente para apontar destaques. São necessários pelo menos{' '}
          {data.insightsMinimumSample} pedidos operacionais no período.
        </p>
      )}
    </section>
  );
}

function MovementChart({ data }: { data: AdvancedReportsDTO }) {
  const maxOrders = Math.max(1, ...data.series.map((item) => item.orderCount));
  const strongest = data.series.reduce<AdvancedReportsDTO['series'][number] | null>(
    (best, item) => (!best || item.orderCount > best.orderCount ? item : best),
    null,
  );
  const width = 720;
  const height = 240;
  const plotTop = 20;
  const plotBottom = 190;
  const plotHeight = plotBottom - plotTop;
  const spacing = data.series.length > 1 ? width / (data.series.length - 1) : width / 2;
  const points = data.series
    .map((item, index) => {
      const x = data.series.length > 1 ? index * spacing : width / 2;
      const y = plotBottom - (item.orderCount / maxOrders) * plotHeight;
      return `${x},${y}`;
    })
    .join(' ');
  const labelEvery = Math.max(1, Math.ceil(data.series.length / 7));

  return (
    <section aria-labelledby="reports-movement-title" className="border-border mt-8 border-t pt-8">
      <div className="flex items-start gap-3">
        <ChartNoAxesCombined
          className="text-brand-700 mt-0.5 h-5 w-5 shrink-0"
          aria-hidden="true"
        />
        <div>
          <h2 id="reports-movement-title" className="text-text-primary text-xl font-bold">
            Movimento no período
          </h2>
          <p className="text-text-secondary mt-1 text-sm leading-6">
            {strongest
              ? `${strongest.fullLabel} concentrou o maior movimento: ${formatInteger(strongest.orderCount)} pedidos e ${formatCurrency(strongest.completedValueCents)} concluídos.`
              : 'O movimento aparecerá aqui quando houver pedidos operacionais.'}
          </p>
        </div>
      </div>

      <div className="mt-5 hidden sm:block" aria-hidden="true">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full overflow-visible">
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
            className="stroke-brand-600"
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
                  className="fill-surface stroke-brand-600"
                  strokeWidth="3"
                />
                {(index % labelEvery === 0 || index === data.series.length - 1) && (
                  <text
                    x={x}
                    y="222"
                    textAnchor={
                      index === 0 ? 'start' : index === data.series.length - 1 ? 'end' : 'middle'
                    }
                    className="fill-text-muted text-xs"
                  >
                    {item.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      <div
        className="mt-5 max-h-[24rem] space-y-3 overflow-y-auto pr-1 sm:hidden"
        aria-hidden="true"
      >
        {data.series.map((item) => (
          <div
            key={item.key}
            className="grid grid-cols-[4.75rem_minmax(0,1fr)_2rem] items-center gap-2"
          >
            <span className="text-text-secondary truncate text-xs">{item.label}</span>
            <span className="bg-surface-tertiary h-3 overflow-hidden rounded-full">
              <span
                className="bg-brand-600 block h-full min-w-1 rounded-full"
                style={{ width: `${Math.max(3, (item.orderCount / maxOrders) * 100)}%` }}
              />
            </span>
            <span className="text-text-primary text-right font-mono text-xs font-bold">
              {item.orderCount}
            </span>
          </div>
        ))}
      </div>

      <details className="border-border mt-5 rounded-xl border">
        <summary className="text-text-primary focus-visible:ring-brand-500 min-h-11 cursor-pointer rounded-xl px-4 py-3 text-sm font-semibold focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none">
          Ver dados do gráfico em tabela
        </summary>
        <div className="border-border overflow-x-auto border-t">
          <table className="w-full min-w-[34rem] text-left text-sm">
            <caption className="sr-only">Pedidos e valor concluído por intervalo</caption>
            <thead className="bg-surface-secondary text-text-secondary">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Intervalo
                </th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">
                  Pedidos
                </th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">
                  Valor concluído
                </th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {data.series.map((item) => (
                <tr key={item.key}>
                  <th scope="row" className="text-text-primary px-4 py-3 font-medium">
                    {item.fullLabel}
                  </th>
                  <td className="text-text-secondary px-4 py-3 text-right font-mono">
                    {item.orderCount}
                  </td>
                  <td className="text-text-secondary px-4 py-3 text-right font-mono">
                    {formatCurrency(item.completedValueCents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}

function RankingAndOperation({ data }: { data: AdvancedReportsDTO }) {
  const topQuantity = Math.max(1, ...data.products.map((product) => product.quantity));
  return (
    <div className="border-border mt-8 grid gap-8 border-t pt-8 lg:grid-cols-[1.05fr_0.95fr]">
      <section aria-labelledby="reports-products-title">
        <div className="flex items-center gap-3">
          <UtensilsCrossed className="text-brand-700 h-5 w-5" aria-hidden="true" />
          <h2 id="reports-products-title" className="text-text-primary text-xl font-bold">
            Produtos mais pedidos
          </h2>
        </div>
        <p className="text-text-secondary mt-1 text-sm">Somente pedidos concluídos e pagos.</p>
        {data.products.length > 0 ? (
          <ol className="mt-5 space-y-4">
            {data.products.map((product, index) => (
              <li
                key={product.productId}
                className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3"
              >
                <span className="bg-kraft text-tinta flex h-8 w-8 items-center justify-center rounded-full font-mono text-sm font-bold">
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-text-primary truncate text-sm font-semibold">{product.name}</p>
                  <div
                    className="bg-surface-tertiary mt-2 h-1.5 overflow-hidden rounded-full"
                    aria-hidden="true"
                  >
                    <div
                      className="bg-brand-600 h-full rounded-full"
                      style={{ width: `${(product.quantity / topQuantity) * 100}%` }}
                    />
                  </div>
                </div>
                <span className="text-text-secondary font-mono text-sm">
                  {formatInteger(product.quantity)} un.
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-text-muted mt-5 text-sm">Nenhum produto concluído no período.</p>
        )}
      </section>

      <section aria-labelledby="reports-operation-title">
        <div className="flex items-center gap-3">
          <Clock3 className="text-brand-700 h-5 w-5" aria-hidden="true" />
          <h2 id="reports-operation-title" className="text-text-primary text-xl font-bold">
            Operação e modalidade
          </h2>
        </div>
        <dl className="border-border mt-5 divide-y rounded-xl border">
          <div className="flex min-h-14 items-center justify-between gap-4 px-4 py-3">
            <dt className="text-text-secondary text-sm">Horário mais forte</dt>
            <dd className="text-text-primary text-right text-sm font-bold">
              {data.peakHour
                ? `${data.peakHour.label} · ${data.peakHour.orderCount} pedidos`
                : 'Sem dados'}
            </dd>
          </div>
          <div className="flex min-h-14 items-center justify-between gap-4 px-4 py-3">
            <dt className="text-text-secondary text-sm">Aceite médio</dt>
            <dd className="text-text-primary text-right text-sm font-bold">
              {formatDuration(data.operation.averageAcceptanceSeconds)}
              <span className="text-text-secondary ml-1 font-normal">
                ({data.operation.acceptanceSampleSize})
              </span>
            </dd>
          </div>
          <div className="flex min-h-14 items-center justify-between gap-4 px-4 py-3">
            <dt className="text-text-secondary text-sm">Preparo médio</dt>
            <dd className="text-text-primary text-right text-sm font-bold">
              {formatDuration(data.operation.averagePreparationSeconds)}
              <span className="text-text-secondary ml-1 font-normal">
                ({data.operation.preparationSampleSize})
              </span>
            </dd>
          </div>
          {data.operation.attentionAlertsCount !== null ? (
            <div className="flex min-h-14 items-center justify-between gap-4 px-4 py-3">
              <dt className="text-text-secondary flex items-center gap-2 text-sm">
                <AlertCircle className="text-warning h-4 w-4" aria-hidden="true" />
                Precisaram de atenção
              </dt>
              <dd className="text-text-primary text-sm font-bold">
                {formatInteger(data.operation.attentionAlertsCount)}
              </dd>
            </div>
          ) : null}
        </dl>

        <div className="mt-5" aria-label="Pedidos por modalidade">
          {data.modalities.map((modality) => (
            <div key={modality.modality} className="mt-3 first:mt-0">
              <div className="flex justify-between gap-4 text-sm">
                <span className="text-text-secondary">{modality.label}</span>
                <span className="text-text-primary font-mono font-bold">
                  {formatPercent(modality.sharePercent)} · {modality.orderCount}
                </span>
              </div>
              <div
                className="bg-surface-tertiary mt-2 h-2 overflow-hidden rounded-full"
                aria-hidden="true"
              >
                <div
                  className="bg-brand-600 h-full rounded-full"
                  style={{ width: `${modality.sharePercent}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function ReportsEmptyState({ periodLabel }: { periodLabel: string }) {
  return (
    <section className="border-border bg-surface mt-8 rounded-2xl border px-5 py-12 text-center sm:px-8">
      <PackageOpen className="text-text-muted mx-auto h-10 w-10" aria-hidden="true" />
      <h2 className="text-text-primary mt-4 text-xl font-bold">Nenhum pedido neste período</h2>
      <p className="text-text-secondary mx-auto mt-2 max-w-md text-sm leading-6">
        Não encontramos pedidos que entraram em operação em {periodLabel.toLowerCase()}. Escolha
        outro período para consultar o movimento da loja.
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
      <div className="bg-surface-tertiary h-4 w-24 rounded" />
      <div className="bg-surface-tertiary mt-3 h-9 w-full max-w-lg rounded-lg" />
      <div className="bg-surface-tertiary mt-3 h-5 w-full max-w-2xl rounded" />
      <div className="border-border mt-8 grid overflow-hidden rounded-2xl border sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <div
            key={item}
            className="border-border h-36 border-b p-5 last:border-b-0 sm:border-r xl:border-b-0"
          >
            <div className="bg-surface-tertiary h-4 w-2/3 rounded" />
            <div className="bg-surface-tertiary mt-4 h-8 w-1/2 rounded" />
          </div>
        ))}
      </div>
      <div className="bg-kraft/65 mt-8 h-36 rounded-2xl" />
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
      <h1 className="text-text-primary mt-4 text-xl font-bold">
        Não foi possível carregar os relatórios
      </h1>
      <p className="text-text-secondary mx-auto mt-2 max-w-lg text-sm leading-6">
        {message ??
          'Tente novamente. Se o problema continuar, volte ao painel e consulte mais tarde.'}
      </p>
      {onRetry ? (
        <Button type="button" className="mt-6" onClick={onRetry}>
          <RefreshCw aria-hidden="true" /> Tentar novamente
        </Button>
      ) : null}
    </section>
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
      {error ? (
        <div className="mt-8" role="alert">
          <ReportsErrorState message={error} onRetry={() => load(lastInput)} />
        </div>
      ) : (
        <div
          key={contentKey}
          className={cn('transition-opacity', isPending && 'pointer-events-none opacity-45')}
        >
          {data.summary.operationalOrders === 0 ? (
            <ReportsEmptyState periodLabel={data.period.label} />
          ) : (
            <>
              <KpiBand data={data} />
              <Highlights data={data} />
              <MovementChart data={data} />
              <RankingAndOperation data={data} />
            </>
          )}
        </div>
      )}
      {isPending ? (
        <span className="sr-only" role="status" aria-live="polite">
          Atualizando relatório
        </span>
      ) : null}
    </div>
  );
}

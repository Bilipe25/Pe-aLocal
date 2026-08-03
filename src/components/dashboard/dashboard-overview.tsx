import Link from 'next/link';
import {
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  Clock3,
  ExternalLink,
  Settings,
  Store,
  Truck,
  UtensilsCrossed,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { EffectiveStoreAvailability } from '@/features/stores/availability';
import { formatCurrency } from '@/lib/utils';
import type { StoreReadiness } from '@/server/services/store-readiness.service';
import type { ActiveOrderCountsDTO, DailyOrderMetricsDTO } from '@/types/order-query';

interface DashboardOverviewSummary {
  categoryCount: number;
  productCount: number;
  deliveryZoneCount: number;
  activeHourCount: number;
  hasAddress: boolean;
}

interface DashboardOverviewProps {
  store: { id: string; name: string; slug: string };
  summary: DashboardOverviewSummary;
  readiness: StoreReadiness;
  availability: EffectiveStoreAvailability;
  orderCounts?: ActiveOrderCountsDTO;
  dailyMetrics?: DailyOrderMetricsDTO;
}

const AVAILABILITY = {
  OPEN: {
    label: 'Aceitando pedidos',
    badge: 'success' as const,
    iconClass: 'bg-success-light text-success',
  },
  CLOSED_BY_SCHEDULE: {
    label: 'Fechada pelo horário',
    badge: 'secondary' as const,
    iconClass: 'bg-surface-tertiary text-text-secondary',
  },
  MANUALLY_CLOSED: {
    label: 'Fechada manualmente',
    badge: 'destructive' as const,
    iconClass: 'bg-error-light text-error',
  },
  PAUSED: {
    label: 'Pedidos pausados',
    badge: 'warning' as const,
    iconClass: 'bg-warning-light text-warning',
  },
  TENANT_SUSPENDED: {
    label: 'Estabelecimento suspenso',
    badge: 'destructive' as const,
    iconClass: 'bg-error-light text-error',
  },
  STORE_INACTIVE: {
    label: 'Unidade inativa',
    badge: 'destructive' as const,
    iconClass: 'bg-error-light text-error',
  },
  NOT_READY: {
    label: 'Configuração incompleta',
    badge: 'warning' as const,
    iconClass: 'bg-warning-light text-warning',
  },
};

function plural(value: number, singular: string, pluralLabel: string) {
  return `${value} ${value === 1 ? singular : pluralLabel}`;
}

function MetricValue({ children }: { children: React.ReactNode }) {
  return (
    <dd className="text-text-primary mt-1 truncate font-mono text-lg font-bold sm:text-xl">
      {children}
    </dd>
  );
}

export function DashboardOverview({
  store,
  summary,
  readiness,
  availability,
  orderCounts,
  dailyMetrics,
}: DashboardOverviewProps) {
  const availabilityPresentation = AVAILABILITY[availability.state];
  const activeOrders = orderCounts?.total ?? null;
  const orderQueue = [
    ['Aguardando', orderCounts?.pending ?? null],
    ['Em preparo', orderCounts?.preparing ?? null],
    ['Prontos ou em rota', orderCounts?.ready ?? null],
  ] as const;

  const catalogReady = !readiness.blockers.some((issue) => issue.code === 'CATALOG_REQUIRED');
  const deliveryReady = !readiness.issues.some((issue) => issue.code === 'DELIVERY_ZONE_REQUIRED');
  const storeDataReady = !readiness.blockers.some((issue) =>
    [
      'ESSENTIAL_DATA_MISSING',
      'OPENING_HOURS_REQUIRED',
      'OPENING_HOURS_INVALID',
      'ADDRESS_REQUIRED',
      'TIMEZONE_INVALID',
    ].includes(issue.code),
  );
  const setupItems = [
    {
      title: 'Catálogo',
      detail: `${plural(summary.categoryCount, 'categoria', 'categorias')} · ${plural(summary.productCount, 'produto', 'produtos')}`,
      href: '/dashboard/catalog',
      icon: UtensilsCrossed,
      complete: catalogReady,
    },
    {
      title: 'Entrega',
      detail: plural(summary.deliveryZoneCount, 'zona configurada', 'zonas configuradas'),
      href: '/dashboard/delivery',
      icon: Truck,
      complete: deliveryReady,
    },
    {
      title: 'Dados da loja',
      detail: `${plural(summary.activeHourCount, 'dia com horário', 'dias com horários')}${summary.hasAddress ? ' · endereço completo' : ''}`,
      href: `/dashboard/stores/${store.id}`,
      icon: Settings,
      complete: storeDataReady,
    },
  ];
  const setupComplete = setupItems.filter((item) => item.complete).length;

  const todayValues = dailyMetrics
    ? [
        { label: 'Pedidos hoje', value: String(dailyMetrics.orderCount) },
        { label: 'Concluídos', value: String(dailyMetrics.completedCount) },
        ...(dailyMetrics.financialMetricsVisible
          ? [
              {
                label: 'Vendas do dia',
                value: formatCurrency(dailyMetrics.grossSales ?? 0),
              },
              {
                label: 'Ticket médio',
                value:
                  dailyMetrics.averageTicket === null
                    ? '—'
                    : formatCurrency(dailyMetrics.averageTicket),
              },
            ]
          : [
              { label: 'Em andamento', value: String(dailyMetrics.activeCount) },
              { label: 'Cancelados', value: String(dailyMetrics.cancelledCount) },
            ]),
      ]
    : null;

  return (
    <div className="space-y-5 sm:space-y-6">
      <section
        className="border-border bg-surface overflow-hidden rounded-xl border"
        aria-labelledby="operation-now-heading"
      >
        <div className="p-4 sm:flex sm:items-start sm:justify-between sm:gap-6 sm:p-5">
          <div className="flex min-w-0 items-start gap-3">
            <span
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${availabilityPresentation.iconClass}`}
            >
              <Store className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 id="operation-now-heading" className="text-text-primary text-lg font-bold">
                  Operação agora
                </h2>
                <Badge variant={availabilityPresentation.badge}>
                  {availabilityPresentation.label}
                </Badge>
              </div>
              <p className="text-text-secondary mt-1 text-sm">{availability.reason}</p>
              <p className="text-text-primary mt-2 text-sm font-medium">
                {activeOrders === null
                  ? 'Não foi possível atualizar a fila neste momento.'
                  : activeOrders === 0
                    ? 'Tudo em dia: nenhum pedido exige acompanhamento.'
                    : plural(activeOrders, 'pedido exige', 'pedidos exigem') + ' acompanhamento.'}
              </p>
            </div>
          </div>
          <Button asChild className="mt-4 w-full sm:mt-0 sm:w-auto sm:shrink-0">
            <Link href="/dashboard/orders">
              Abrir central <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </div>

        <dl className="border-border bg-surface-secondary/45 grid grid-cols-3 border-t">
          {orderQueue.map(([label, value], index) => (
            <div
              key={label}
              className={`min-w-0 px-3 py-3 sm:px-5 ${index > 0 ? 'border-border border-l' : ''}`}
            >
              <dt className="text-text-secondary line-clamp-2 text-xs leading-4 font-medium sm:text-sm">
                {label}
              </dt>
              <MetricValue>{value ?? '—'}</MetricValue>
            </div>
          ))}
        </dl>
      </section>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(19rem,0.85fr)] lg:gap-6">
        <section
          className="border-border bg-surface rounded-xl border"
          aria-labelledby="today-heading"
        >
          <header className="flex items-start justify-between gap-4 px-4 pt-4 sm:px-5 sm:pt-5">
            <div>
              <h2 id="today-heading" className="text-text-primary text-lg font-bold">
                Resultado de hoje
              </h2>
              <p className="text-text-secondary mt-0.5 text-sm">
                Pedidos criados no dia local desta unidade.
              </p>
            </div>
            <Clock3 className="text-text-muted mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          </header>

          {todayValues ? (
            <dl className="border-border mt-4 grid grid-cols-2 border-t sm:grid-cols-4">
              {todayValues.map((item, index) => (
                <div
                  key={item.label}
                  className={`min-w-0 px-4 py-3.5 sm:px-5 ${index % 2 === 1 ? 'border-border border-l' : ''} ${index >= 2 ? 'border-border border-t sm:border-t-0' : ''} ${index >= 1 ? 'sm:border-border sm:border-l' : ''}`}
                >
                  <dt className="text-text-secondary text-xs font-medium sm:text-sm">
                    {item.label}
                  </dt>
                  <MetricValue>{item.value}</MetricValue>
                </div>
              ))}
            </dl>
          ) : (
            <div className="border-warning/25 bg-warning-light text-warning mt-4 border-t px-4 py-4 text-sm sm:px-5">
              O resumo de hoje está temporariamente indisponível. A Central de Pedidos continua
              acessível.
            </div>
          )}
        </section>

        <section
          className="border-border bg-surface overflow-hidden rounded-xl border"
          aria-labelledby="setup-heading"
        >
          <header className="flex items-start gap-3 px-4 py-4 sm:px-5">
            <span
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${readiness.isReady ? 'bg-success-light text-success' : 'bg-warning-light text-warning'}`}
            >
              {readiness.isReady ? (
                <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
              ) : (
                <CircleAlert className="h-5 w-5" aria-hidden="true" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 id="setup-heading" className="text-text-primary font-bold">
                  Pronta para vender
                </h2>
                <span className="text-text-secondary font-mono text-xs font-bold">
                  {setupComplete}/3
                </span>
              </div>
              <p className="text-text-secondary mt-1 text-sm">
                {readiness.isReady
                  ? readiness.warnings.length > 0
                    ? `${plural(readiness.warnings.length, 'recomendação pendente', 'recomendações pendentes')}.`
                    : 'Configurações essenciais revisadas.'
                  : `${plural(readiness.blockers.length, 'bloqueador exige', 'bloqueadores exigem')} correção.`}
              </p>
            </div>
          </header>

          <nav
            className="divide-border border-border divide-y border-t"
            aria-label="Preparação da loja"
          >
            {setupItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="group hover:bg-surface-secondary focus-visible:ring-brand-500 flex min-h-16 items-center gap-3 px-4 py-3 transition-colors focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset sm:px-5"
              >
                <item.icon className="text-brand-600 h-5 w-5 shrink-0" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="text-text-primary block text-sm font-semibold">
                    {item.title}
                  </span>
                  <span className="text-text-secondary mt-0.5 block truncate text-xs">
                    {item.detail}
                  </span>
                </span>
                <span
                  className={`hidden text-xs font-semibold min-[380px]:inline ${item.complete ? 'text-success' : 'text-warning'}`}
                >
                  {item.complete ? 'Configurado' : 'Revisar'}
                </span>
                <ArrowRight
                  className="text-text-muted h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </Link>
            ))}
          </nav>

          <div className="border-border bg-surface-secondary/45 border-t p-3 sm:px-4">
            <Button asChild variant="ghost" size="sm" className="w-full justify-center">
              <Link href={`/dashboard/stores/${store.id}`}>
                Revisar Minha Loja <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </section>
      </div>

      <div className="flex justify-center sm:hidden">
        <Link
          href={`/${store.slug}`}
          target="_blank"
          rel="noreferrer"
          className="text-text-secondary hover:text-text-primary focus-visible:ring-brand-500 inline-flex min-h-11 items-center gap-2 px-3 text-sm font-medium underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:outline-none"
        >
          <ExternalLink className="h-4 w-4" aria-hidden="true" /> Ver cardápio público
        </Link>
      </div>
    </div>
  );
}

import { CircleCheck, Clock3, Gift, Sparkles, UsersRound } from 'lucide-react';

import { PageHeader } from '@/components/shared/page-header';
import { LoyaltyProgramForm } from '@/features/loyalty/components/loyalty-program-form';
import { getLoyaltyDashboard } from '@/server/services/loyalty.service';

export const metadata = { title: 'Fidelidade' };

export default async function LoyaltyPage() {
  const result = await getLoyaltyDashboard();
  const metrics = [
    { label: 'Clientes participando', value: result.metrics.participating, icon: UsersRound },
    { label: 'Benefícios conquistados', value: result.metrics.earned, icon: Sparkles },
    { label: 'Benefícios usados', value: result.metrics.used, icon: Gift },
    { label: 'Benefícios disponíveis', value: result.metrics.available, icon: CircleCheck },
    { label: 'Benefícios expirados', value: result.metrics.expired, icon: Clock3 },
  ];
  return (
    <div>
      <PageHeader
        title="Fidelidade"
        description={`Faça o cliente voltar a ${result.store.name}.`}
      />
      <LoyaltyProgramForm
        initial={result.program}
        canEdit={result.canEdit}
        advancedEnabled={result.advancedEnabled}
        products={result.products}
      />
      <section
        className="border-border bg-surface mt-8 rounded-xl border p-4 sm:p-6"
        aria-labelledby="loyalty-results-title"
      >
        <div className="max-w-2xl">
          <h2 id="loyalty-results-title" className="font-bold">
            Resultados da fidelidade
          </h2>
          <p className="text-text-secondary mt-1 text-sm">
            Acompanhe adesão, benefícios e o valor já concedido aos clientes.
          </p>
        </div>
        <dl className="border-border mt-5 grid grid-cols-2 border-y sm:grid-cols-3 lg:grid-cols-5">
          {metrics.map((metric) => (
            <div key={metric.label} className="min-w-0 px-3 py-4 first:pl-0 lg:last:pr-0">
              <dt className="text-text-secondary flex items-center gap-2 text-sm">
                <metric.icon className="text-brand-600 size-4 shrink-0" aria-hidden="true" />
                <span>{metric.label}</span>
              </dt>
              <dd className="mt-2 font-mono text-2xl font-bold tabular-nums">{metric.value}</dd>
            </div>
          ))}
        </dl>
        <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-text-secondary">Pedidos com benefício</dt>
            <dd className="mt-1 font-mono text-xl font-bold tabular-nums">
              {result.metrics.ordersUsing}
            </dd>
          </div>
          <div>
            <dt className="text-text-secondary">Valor concedido</dt>
            <dd className="mt-1 font-mono text-xl font-bold tabular-nums">
              {(result.metrics.benefitValueUsed / 100).toLocaleString('pt-BR', {
                style: 'currency',
                currency: 'BRL',
              })}
            </dd>
          </div>
        </dl>
        {result.advancedEnabled ? (
          <p className="text-text-secondary mt-4 text-sm">
            Resgates por tipo: desconto em reais {result.metrics.usedByType.FIXED_DISCOUNT ?? 0} ·
            percentual {result.metrics.usedByType.PERCENT_DISCOUNT ?? 0} · produto grátis{' '}
            {result.metrics.usedByType.FREE_PRODUCT ?? 0}
          </p>
        ) : null}
      </section>
    </div>
  );
}

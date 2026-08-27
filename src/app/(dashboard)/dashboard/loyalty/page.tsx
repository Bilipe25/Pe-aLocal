import { Gift, RotateCcw, Sparkles, UsersRound } from 'lucide-react';

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
    { label: 'Pedidos com fidelidade', value: result.metrics.ordersUsing, icon: RotateCcw },
  ];
  return (
    <div>
      <PageHeader
        title="Fidelidade"
        description={`Faça o cliente voltar a ${result.store.name}.`}
      />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {metrics.map((metric) => (
          <div
            key={metric.label}
            className="border-border bg-surface min-w-0 rounded-xl border p-4"
          >
            <metric.icon className="text-brand-600 size-5" aria-hidden="true" />
            <p className="mt-3 font-mono text-2xl font-bold">{metric.value}</p>
            <p className="text-text-secondary mt-1 text-sm">{metric.label}</p>
          </div>
        ))}
      </div>
      <LoyaltyProgramForm initial={result.program} canEdit={result.canEdit} />
      <p className="text-text-secondary mt-4 max-w-3xl text-sm">
        Alterar a regra cria uma nova versão. Quem já começou continua com a promessa anterior até
        concluir o ciclo. Desativar pausa novos créditos; benefícios já conquistados continuam
        válidos.
      </p>
    </div>
  );
}

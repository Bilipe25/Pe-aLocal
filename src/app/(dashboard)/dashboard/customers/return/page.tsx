import { RotateCcw, UsersRound } from 'lucide-react';

import { PageHeader } from '@/components/shared/page-header';
import { ReturnCampaignForm } from '@/features/customers/components/return-campaign-form';
import { formatCurrency } from '@/lib/utils';
import { getCustomerReturnCampaignDashboard } from '@/server/services/customer-return-campaign.service';

const targetLabels = {
  COOLING: 'Estão sumindo',
  INACTIVE: 'Não pedem há tempo',
  COOLING_AND_INACTIVE: 'Estão sumindo + não pedem há tempo',
} as const;

function campaignRewardLabel(
  campaign: Awaited<ReturnType<typeof getCustomerReturnCampaignDashboard>>['campaigns'][number],
) {
  if (campaign.rewardType === 'FIXED_DISCOUNT') return formatCurrency(campaign.rewardValue ?? 0);
  if (campaign.rewardType === 'PERCENT_DISCOUNT') {
    return `${(campaign.percentageBasisPoints ?? 0) / 100}% de desconto`;
  }
  return `${campaign.freeProductNameSnapshot ?? 'Produto'} grátis`;
}

export default async function CustomerReturnPage() {
  const dashboard = await getCustomerReturnCampaignDashboard();
  return (
    <div>
      <PageHeader
        backHref="/dashboard/customers"
        title="Volta pra cá"
        description={`Ajude clientes de ${dashboard.store.name} a fazer um novo pedido.`}
      />

      {dashboard.audience.total > 0 && dashboard.canCreate ? (
        <ReturnCampaignForm
          audience={dashboard.audience}
          advancedEnabled={dashboard.advancedEnabled}
          products={dashboard.products}
        />
      ) : (
        <section className="border-border rounded-xl border p-6 text-center">
          {dashboard.audience.total === 0 ? (
            <UsersRound className="text-text-muted mx-auto" aria-hidden="true" />
          ) : (
            <RotateCcw className="text-text-muted mx-auto" aria-hidden="true" />
          )}
          <h2 className="mt-3 font-bold">
            {dashboard.audience.total === 0
              ? 'Ninguém precisa desse empurrão agora'
              : 'Ative a fidelidade primeiro'}
          </h2>
          <p className="text-text-secondary mx-auto mt-1 max-w-prose text-sm">
            {dashboard.audience.total === 0
              ? 'Quando alguém passar mais tempo do que o normal sem pedir, aparecerá aqui.'
              : 'O Volta pra cá usa o mesmo benefício seguro da fidelidade. Publique um programa antes de continuar.'}
          </p>
        </section>
      )}

      <section className="mt-8" aria-labelledby="campaign-history-title">
        <h2 id="campaign-history-title" className="font-bold">
          Ações recentes
        </h2>
        {dashboard.campaigns.length ? (
          <ul className="border-border bg-surface mt-3 divide-y rounded-xl border">
            {dashboard.campaigns.map((campaign) => (
              <li key={campaign.id} className="p-4 sm:p-5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-semibold">{campaignRewardLabel(campaign)}</p>
                    <p className="text-text-secondary mt-1 text-sm">
                      {targetLabels[campaign.target]} · pedido mínimo{' '}
                      {formatCurrency(campaign.minimumOrderValue)}
                    </p>
                  </div>
                  <span className="bg-surface-secondary text-text-secondary w-fit rounded-full px-2.5 py-1 text-xs font-medium">
                    {campaign.status === 'ACTIVE'
                      ? 'Ativa'
                      : campaign.status === 'ENDED'
                        ? 'Encerrada'
                        : 'Cancelada'}
                  </span>
                </div>
                <p className="text-text-secondary mt-3 text-xs">
                  {campaign.metrics.selected}{' '}
                  {campaign.metrics.selected === 1
                    ? 'cliente selecionado'
                    : 'clientes selecionados'}
                  .
                </p>
                <dl className="mt-4 grid grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-5">
                  {[
                    ['Clientes convidados', campaign.metrics.invited],
                    ['Voltaram', campaign.metrics.returned],
                    ['Pedidos concluídos', campaign.metrics.orders],
                    ['Valor desses pedidos', formatCurrency(campaign.metrics.orderValue)],
                    ['Benefícios usados', campaign.metrics.rewardsUsed],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-text-secondary text-xs">{label}</dt>
                      <dd className="mt-1 font-mono font-bold">{value}</dd>
                    </div>
                  ))}
                </dl>
                {campaign.metrics.benefitValueUsed > 0 ? (
                  <p className="text-text-secondary mt-3 text-xs">
                    {formatCurrency(campaign.metrics.benefitValueUsed)} em benefícios utilizados.
                    Esses números descrevem pedidos de quem recebeu a ação; não representam lucro ou
                    receita incremental.
                  </p>
                ) : null}
                {campaign.metrics.selected > 0 && campaign.metrics.invited === 0 ? (
                  <p className="text-text-secondary mt-3 text-xs">
                    Os benefícios foram disponibilizados de forma privada, mas nenhum aviso
                    promocional foi enviado sem consentimento e canal disponível.
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-text-secondary mt-2 text-sm">Nenhuma ação criada até agora.</p>
        )}
      </section>
    </div>
  );
}

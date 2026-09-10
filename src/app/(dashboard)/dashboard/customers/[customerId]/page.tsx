import { RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import {
  CUSTOMER_RELATIONSHIP_LABELS,
  isRelationshipAttentionSegment,
} from '@/domain/customers/relationship';
import { formatPhone } from '@/lib/brazil';
import { formatCurrency } from '@/lib/utils';
import { getCustomerProfileV1 } from '@/server/services/customers-v1.service';

const legacyLabels = {
  NEW: 'Novo',
  RECURRING: 'Recorrente',
  LAPSED: 'Faz tempo que não pede',
} as const;

function lastOrderCopy(days: number) {
  if (days === 0) return 'Hoje';
  if (days === 1) return 'Ontem';
  return `Há ${days} dias`;
}

export default async function CustomerProfilePage({
  params,
}: {
  params: Promise<{ customerId: string }>;
}) {
  const { customerId } = await params;
  let result;
  try {
    result = await getCustomerProfileV1(customerId);
  } catch {
    notFound();
  }
  const metrics = result.metrics;
  const usual = result.repurchase?.usual;
  const relationship = result.relationship;
  const description = relationship
    ? CUSTOMER_RELATIONSHIP_LABELS[relationship.segment]
    : metrics?.classification
      ? metrics.classification === 'LAPSED'
        ? legacyLabels.LAPSED
        : result.relationshipEnabled
          ? CUSTOMER_RELATIONSHIP_LABELS[metrics.classification]
          : legacyLabels[metrics.classification as keyof typeof legacyLabels]
      : 'Sem classificação de compras';

  return (
    <div>
      <PageHeader
        backHref="/dashboard/customers"
        title={result.customer.name}
        description={description}
      />

      {result.relationshipEnabled ? (
        <nav
          className="border-border mb-5 flex gap-1 overflow-x-auto border-b pb-2"
          aria-label="Seções do cliente"
        >
          {[
            ['#resumo', 'Resumo'],
            ['#relacionamento', 'Relacionamento'],
            ['#fidelidade', 'Fidelidade'],
            ['#pedidos', 'Pedidos'],
          ].map(([href, label]) => (
            <a
              key={href}
              href={href}
              className="hover:bg-surface-secondary focus-visible:ring-brand-500 min-h-11 shrink-0 rounded-lg px-3 py-2.5 text-sm font-medium focus-visible:ring-2 focus-visible:outline-none"
            >
              {label}
            </a>
          ))}
        </nav>
      ) : null}

      <dl
        id="resumo"
        className="border-border grid grid-cols-2 divide-x divide-y rounded-xl border sm:grid-cols-4 sm:divide-y-0"
      >
        <div className="p-4">
          <dt className="text-text-secondary text-xs">Pedidos concluídos</dt>
          <dd className="mt-1 font-mono text-xl font-bold">{metrics?.completedOrders ?? 0}</dd>
        </div>
        <div className="p-4">
          <dt className="text-text-secondary text-xs">Total em pedidos</dt>
          <dd className="mt-1 font-mono text-xl font-bold">
            {formatCurrency(metrics?.totalSpent ?? 0)}
          </dd>
        </div>
        <div className="p-4">
          <dt className="text-text-secondary text-xs">Pedido médio</dt>
          <dd className="mt-1 font-mono text-xl font-bold">
            {formatCurrency(metrics?.averageTicket ?? 0)}
          </dd>
        </div>
        <div className="p-4">
          <dt className="text-text-secondary text-xs">Último pedido</dt>
          <dd className="mt-1 text-sm font-bold">
            {relationship
              ? lastOrderCopy(relationship.lastOrderDaysAgo)
              : metrics?.lastOrderAt
                ? new Intl.DateTimeFormat('pt-BR').format(metrics.lastOrderAt)
                : '—'}
          </dd>
        </div>
      </dl>

      {relationship ? (
        <section
          id="relacionamento"
          className="border-border bg-surface mt-6 rounded-xl border p-4"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="font-bold">Relacionamento</h2>
              <p className="mt-2 text-lg font-semibold">
                {CUSTOMER_RELATIONSHIP_LABELS[relationship.segment]}
              </p>
              <p className="text-text-secondary mt-1 max-w-prose text-sm">
                {relationship.averageDaysBetweenOrders != null
                  ? `Costuma pedir a cada ${Math.max(1, Math.round(relationship.averageDaysBetweenOrders))} dias.`
                  : 'Ainda estamos conhecendo o ritmo de pedidos desta pessoa.'}{' '}
                {relationship.thresholds.mode === 'AUTOMATIC'
                  ? `A atenção começa depois de ${relationship.thresholds.coolingAfterDays} dias sem pedir.`
                  : 'Enquanto há pouco histórico, usamos a referência simples de 30 dias.'}
              </p>
            </div>
            {isRelationshipAttentionSegment(relationship.segment) && result.loyalty ? (
              <Button asChild className="shrink-0">
                <Link href="/dashboard/customers/return">
                  <RotateCcw aria-hidden="true" />
                  Trazer de volta
                </Link>
              </Button>
            ) : null}
          </div>
        </section>
      ) : result.relationshipEnabled ? (
        <section id="relacionamento" className="border-border mt-6 rounded-xl border p-4">
          <h2 className="font-bold">Relacionamento</h2>
          <p className="text-text-secondary mt-2 text-sm">
            A classificação aparecerá depois que um pedido concluído estiver ligado à conta
            verificada deste cliente.
          </p>
        </section>
      ) : null}

      {(result.mostOrdered || usual) && (
        <section className="border-border bg-surface mt-6 grid gap-5 rounded-xl border p-4 sm:grid-cols-2">
          {result.mostOrdered && (
            <div>
              <h2 className="text-text-secondary text-xs">Mais pedido</h2>
              <p className="mt-1 font-semibold">{result.mostOrdered.productName}</p>
              <p className="text-text-secondary text-sm">
                Em {result.mostOrdered.orderCount} compras
              </p>
            </div>
          )}
          {usual && (
            <div>
              <h2 className="text-text-secondary text-xs">Pedido de sempre</h2>
              <p className="mt-1 font-semibold">
                {usual.items.map((item) => `${item.quantity}× ${item.productName}`).join(' + ')}
              </p>
              <p className="text-text-secondary text-sm">Repetido {usual.occurrences} vezes</p>
            </div>
          )}
        </section>
      )}

      <section className="border-border bg-surface mt-6 rounded-xl border p-4">
        <h2 className="font-bold">Contato</h2>
        <p className="mt-2 text-sm">{formatPhone(result.customer.phone)}</p>
      </section>

      {result.loyalty ? (
        <section id="fidelidade" className="border-border bg-surface mt-6 rounded-xl border p-4">
          <h2 className="font-bold">Fidelidade e benefícios</h2>
          <p className="mt-2 font-mono text-xl font-bold">
            {result.loyalty.cycle
              ? `${result.loyalty.cycle.progress}/${result.loyalty.cycle.requiredOrders}`
              : 'Pronto para começar'}
          </p>
          <div className="text-text-secondary mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
            <span>
              {result.loyalty.availableRewards === 1
                ? '1 benefício disponível'
                : `${result.loyalty.availableRewards} benefícios disponíveis`}
            </span>
            <span>
              {result.loyalty.usedRewards === 1
                ? '1 benefício usado'
                : `${result.loyalty.usedRewards} benefícios usados`}
            </span>
          </div>
        </section>
      ) : null}

      <section id="pedidos" className="mt-7">
        <h2 className="font-bold">Últimos pedidos</h2>
        {result.orders.length ? (
          <ul className="border-border bg-surface mt-3 divide-y rounded-xl border">
            {result.orders.map((order) => (
              <li key={order.id} className="flex items-center justify-between gap-3 p-4">
                <div>
                  <strong className="font-mono text-sm">Pedido #{order.orderNumber}</strong>
                  <p className="text-text-secondary mt-0.5 text-xs">
                    {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(
                      order.createdAt,
                    )}{' '}
                    · {order.status}
                  </p>
                </div>
                <strong className="font-mono text-sm">{formatCurrency(order.total)}</strong>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-text-secondary mt-2 text-sm">Nenhum pedido nesta loja.</p>
        )}
      </section>
    </div>
  );
}

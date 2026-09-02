import { notFound } from 'next/navigation';

import { PageHeader } from '@/components/shared/page-header';
import { formatPhone } from '@/lib/brazil';
import { formatCurrency } from '@/lib/utils';
import { getCustomerProfileV1 } from '@/server/services/customers-v1.service';

const labels = { NEW: 'Novo', RECURRING: 'Recorrente', LAPSED: 'Faz tempo que não pede' } as const;

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

  return (
    <div>
      <PageHeader
        backHref="/dashboard/customers"
        title={result.customer.name}
        description={
          metrics?.classification ? labels[metrics.classification] : 'Sem classificação de compras'
        }
      />
      <dl className="border-border grid grid-cols-2 divide-x divide-y rounded-xl border sm:grid-cols-4 sm:divide-y-0">
        <div className="p-4">
          <dt className="text-text-secondary text-xs">Compras concluídas</dt>
          <dd className="mt-1 font-mono text-xl font-bold">{metrics?.completedOrders ?? 0}</dd>
        </div>
        <div className="p-4">
          <dt className="text-text-secondary text-xs">Total gasto</dt>
          <dd className="mt-1 font-mono text-xl font-bold">
            {formatCurrency(metrics?.totalSpent ?? 0)}
          </dd>
        </div>
        <div className="p-4">
          <dt className="text-text-secondary text-xs">Ticket médio</dt>
          <dd className="mt-1 font-mono text-xl font-bold">
            {formatCurrency(metrics?.averageTicket ?? 0)}
          </dd>
        </div>
        <div className="p-4">
          <dt className="text-text-secondary text-xs">Última compra</dt>
          <dd className="mt-1 font-mono text-sm font-bold">
            {metrics?.lastOrderAt
              ? new Intl.DateTimeFormat('pt-BR').format(metrics.lastOrderAt)
              : '—'}
          </dd>
        </div>
      </dl>
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
        <section className="border-border bg-surface mt-6 rounded-xl border p-4">
          <h2 className="font-bold">Fidelidade</h2>
          <p className="mt-2 font-mono text-xl font-bold">
            {result.loyalty.cycle
              ? `${result.loyalty.cycle.progress}/${result.loyalty.cycle.requiredOrders}`
              : 'Pronto para começar'}
          </p>
          <p className="text-text-secondary mt-1 text-sm">
            {result.loyalty.availableRewards === 1
              ? '1 benefício disponível'
              : `${result.loyalty.availableRewards} benefícios disponíveis`}
          </p>
          <p className="text-text-secondary mt-1 text-sm">
            {result.loyalty.usedRewards === 1
              ? '1 benefício usado'
              : `${result.loyalty.usedRewards} benefícios usados`}
          </p>
        </section>
      ) : null}
      <section className="mt-7">
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

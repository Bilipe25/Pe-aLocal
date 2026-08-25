'use client';

import { CheckCircle2, Clock3, RotateCcw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { repeatOrderIntoCart } from '@/features/storefront/repeat-order';
import { formatCurrency } from '@/lib/utils';

type Order = {
  id: string;
  orderNumber: number;
  status: string;
  paymentStatus: string;
  modality: string;
  total: number;
  createdAt: string;
};

export function ConsumerOrderHistory({
  storeId,
  storeSlug,
  customerName,
  active,
  previous,
  hasMore,
  page,
}: {
  storeId: string;
  storeSlug: string;
  customerName: string | null;
  active: Order[];
  previous: Order[];
  hasMore: boolean;
  page: number;
}) {
  const router = useRouter();
  const [repeating, setRepeating] = useState<string | null>(null);
  async function repeat(orderId: string) {
    setRepeating(orderId);
    try {
      const result = await repeatOrderIntoCart({ storeId, storeSlug, reference: { orderId } });
      if (result.addedQuantity) {
        toast.success('Itens disponíveis adicionados com os valores atuais.');
        router.push(`/${storeSlug}/cart`);
      } else toast.warning('Os itens deste pedido precisam ser revistos.');
    } catch {
      toast.error('Não foi possível revisar este pedido.');
    } finally {
      setRepeating(null);
    }
  }
  const list = (orders: Order[], activeList: boolean) => (
    <ul className="mt-3 grid gap-3">
      {orders.map((order) => (
        <li key={order.id} className="border-border bg-surface rounded-xl border p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex gap-2">
              <span
                className={
                  activeList
                    ? 'bg-info-light text-info flex h-9 w-9 items-center justify-center rounded-lg'
                    : 'bg-success-light text-success flex h-9 w-9 items-center justify-center rounded-lg'
                }
              >
                {activeList ? (
                  <Clock3 className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                )}
              </span>
              <div>
                <p className="font-mono text-sm font-bold">Pedido #{order.orderNumber}</p>
                <p className="text-text-secondary mt-0.5 text-xs">
                  {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(
                    new Date(order.createdAt),
                  )}{' '}
                  ·{' '}
                  {order.modality === 'DELIVERY'
                    ? 'Entrega'
                    : order.modality === 'DINE_IN'
                      ? 'Mesa'
                      : 'Retirada'}
                </p>
              </div>
            </div>
            <strong className="font-mono text-sm">{formatCurrency(order.total)}</strong>
          </div>
          {!activeList ? (
            <Button
              type="button"
              variant="outline"
              className="mt-3 w-full"
              disabled={repeating !== null}
              onClick={() => void repeat(order.id)}
            >
              <RotateCcw aria-hidden="true" />
              {repeating === order.id ? 'Revisando…' : 'Pedir novamente'}
            </Button>
          ) : null}
        </li>
      ))}
    </ul>
  );
  return (
    <section aria-labelledby="consumer-orders-title">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 id="consumer-orders-title" className="text-xl font-bold">
            Olá{customerName ? `, ${customerName.split(' ')[0]}` : ''}
          </h2>
          <p className="text-text-secondary text-sm">
            Seus pedidos disponíveis com acesso verificado.
          </p>
        </div>
        <a
          href={`/${storeSlug}/account`}
          className="text-brand-700 min-h-11 px-2 py-3 text-sm font-semibold underline underline-offset-4"
        >
          Minha conta
        </a>
      </div>
      {active.length ? (
        <div className="mt-6">
          <h3 className="font-bold">Em andamento</h3>
          {list(active, true)}
        </div>
      ) : null}
      <div className="mt-7">
        <h3 className="font-bold">Pedidos anteriores</h3>
        {previous.length ? (
          list(previous, false)
        ) : (
          <p className="text-text-secondary mt-3 text-sm">Nenhum pedido anterior nesta loja.</p>
        )}
      </div>
      <div className="mt-4 flex justify-between">
        {page > 1 ? (
          <a
            className="min-h-11 py-3 text-sm font-semibold underline"
            href={`/${storeSlug}/orders?page=${page - 1}`}
          >
            Mais recentes
          </a>
        ) : (
          <span />
        )}
        {hasMore ? (
          <a
            className="min-h-11 py-3 text-sm font-semibold underline"
            href={`/${storeSlug}/orders?page=${page + 1}`}
          >
            Mais antigos
          </a>
        ) : null}
      </div>
    </section>
  );
}

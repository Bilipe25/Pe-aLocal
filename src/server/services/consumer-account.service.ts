import 'server-only';

import { Prisma } from '@prisma/client';

import { getDb } from '@/server/database/client';
import { NotFoundError } from '@/server/errors';
import { requireConsumerForStore } from '@/server/services/consumer-auth.service';

const TERMINAL_STATUSES = ['DELIVERED', 'CANCELLED'] as const;
const orderSelect = {
  id: true,
  orderNumber: true,
  status: true,
  paymentStatus: true,
  modality: true,
  total: true,
  createdAt: true,
  deliveredAt: true,
  items: {
    orderBy: [{ position: 'asc' }, { id: 'asc' }],
    take: 3,
    select: { productName: true, quantity: true },
  },
  _count: { select: { items: true } },
} satisfies Prisma.OrderSelect;

export async function listConsumerOrders(input: {
  storeSlug: string;
  sessionToken?: string | null;
  page: number;
}) {
  const { scope, consumer } = await requireConsumerForStore(input);
  if (!consumer.customer) return { customerName: null, active: [], previous: [], hasMore: false };
  const where = {
    tenantId: scope.tenantId,
    storeId: scope.id,
    customerId: consumer.customer.id,
  };
  const [active, previous] = await Promise.all([
    getDb().order.findMany({
      where: { ...where, status: { notIn: [...TERMINAL_STATUSES] } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 20,
      select: orderSelect,
    }),
    getDb().order.findMany({
      where: { ...where, status: { in: [...TERMINAL_STATUSES] } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (input.page - 1) * 20,
      take: 21,
      select: orderSelect,
    }),
  ]);
  return {
    customerName: consumer.customer.name,
    active,
    previous: previous.slice(0, 20),
    hasMore: previous.length > 20,
  };
}

export async function getConsumerOrderDetail(input: {
  storeSlug: string;
  sessionToken?: string | null;
  orderId: string;
}) {
  const { scope, consumer } = await requireConsumerForStore(input);
  if (!consumer.customer) throw new NotFoundError('Pedido');
  const order = await getDb().order.findFirst({
    where: {
      id: input.orderId,
      tenantId: scope.tenantId,
      storeId: scope.id,
      customerId: consumer.customer.id,
    },
    select: {
      ...orderSelect,
      deliveryAddress: true,
      notes: true,
      items: {
        orderBy: [{ position: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          productName: true,
          quantity: true,
          unitPrice: true,
          itemTotal: true,
          options: { select: { id: true, optionName: true, optionPrice: true } },
        },
      },
    },
  });
  if (!order) throw new NotFoundError('Pedido');
  return order;
}

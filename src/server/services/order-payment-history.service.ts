import 'server-only';

import type { OrderChangeSource, PaymentStatus, Prisma } from '@prisma/client';

type PaymentHistoryClient = Pick<Prisma.TransactionClient, 'paymentStatusHistory'>;

export async function appendPaymentStatusHistory(
  tx: PaymentHistoryClient,
  data: {
    tenantId: string;
    storeId: string;
    orderId: string;
    paymentId: string;
    fromStatus: PaymentStatus | null;
    toStatus: PaymentStatus;
    changedById: string | null;
    actorNameSnapshot: string;
    source: OrderChangeSource;
    reasonCode?: string;
    note?: string;
    orderVersionFrom: number | null;
    orderVersionTo: number | null;
    createdAt: Date;
  },
) {
  return tx.paymentStatusHistory.create({
    data: {
      tenantId: data.tenantId,
      storeId: data.storeId,
      orderId: data.orderId,
      paymentId: data.paymentId,
      fromStatus: data.fromStatus,
      toStatus: data.toStatus,
      changedById: data.changedById,
      actorNameSnapshot: data.actorNameSnapshot,
      source: data.source,
      reasonCode: data.reasonCode,
      note: data.note,
      orderVersionFrom: data.orderVersionFrom,
      orderVersionTo: data.orderVersionTo,
      createdAt: data.createdAt,
    },
    select: { id: true },
  });
}

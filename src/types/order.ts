import type { Prisma } from '@prisma/client';

export const orderWithDetailsSelect = {
  id: true,
  orderNumber: true,
  customerName: true,
  customerPhone: true,
  modality: true,
  deliveryAddress: true,
  deliveryZoneName: true,
  subtotal: true,
  discount: true,
  deliveryFee: true,
  total: true,
  paymentMethod: true,
  changeFor: true,
  status: true,
  paymentStatus: true,
  version: true,
  statusChangedAt: true,
  acceptedAt: true,
  preparingAt: true,
  readyAt: true,
  dispatchedAt: true,
  deliveredAt: true,
  cancelledAt: true,
  cancellationReasonCode: true,
  cancellationNote: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  items: {
    select: {
      id: true,
      productName: true,
      unitPrice: true,
      quantity: true,
      notes: true,
      itemTotal: true,
      options: {
        select: {
          id: true,
          optionName: true,
          optionPrice: true,
        },
      },
    },
  },
  statusHistory: {
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 8,
    select: {
      id: true,
      fromStatus: true,
      toStatus: true,
      note: true,
      actorNameSnapshot: true,
      source: true,
      reasonCode: true,
      isUndo: true,
      createdAt: true,
    },
  },
} satisfies Prisma.OrderSelect;

export type OrderWithDetails = Prisma.OrderGetPayload<{
  select: typeof orderWithDetailsSelect;
}>;

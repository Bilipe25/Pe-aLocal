import 'server-only';

import type {
  AuditAction,
  OrderChangeSource,
  OrderCancellationReasonCode,
  OrderStatus,
  PaymentStatus,
  Prisma,
} from '@prisma/client';

import * as auditRepo from '@/server/repositories/audit-log.repository';
import type { OrderMutationContext } from './order-mutation.types';

type OrderAuditContext = Pick<OrderMutationContext, 'tenantId' | 'storeId' | 'userId'>;

interface PaymentAuditContext {
  tenantId: string;
  storeId: string;
  userId: string | null;
}

export async function writeOrderStatusAudit(
  tx: Prisma.TransactionClient,
  context: OrderAuditContext,
  data: {
    orderId: string;
    action: AuditAction;
    previousStatus: OrderStatus;
    nextStatus: OrderStatus;
    previousVersion: number;
    nextVersion: number;
    reasonCode?: OrderCancellationReasonCode;
    hasNote?: boolean;
    revertedHistoryId?: string;
  },
): Promise<string> {
  const audit = await auditRepo.createAuditLog(
    {
      tenantId: context.tenantId,
      storeId: context.storeId,
      userId: context.userId,
      action: data.action,
      entity: 'Order',
      entityId: data.orderId,
      metadata: {
        source: 'DASHBOARD',
        previousStatus: data.previousStatus,
        nextStatus: data.nextStatus,
        previousVersion: data.previousVersion,
        nextVersion: data.nextVersion,
        ...(data.reasonCode ? { reasonCode: data.reasonCode } : {}),
        ...(data.hasNote !== undefined ? { hasNote: data.hasNote } : {}),
        ...(data.revertedHistoryId ? { revertedHistoryId: data.revertedHistoryId } : {}),
      },
    },
    tx,
  );
  return audit.id;
}

export async function writePaymentAudit(
  tx: Prisma.TransactionClient,
  context: PaymentAuditContext,
  data: {
    orderId: string;
    paymentId: string;
    action: AuditAction;
    previousStatus: PaymentStatus;
    nextStatus: PaymentStatus;
    previousVersion: number;
    nextVersion: number;
    source?: OrderChangeSource;
    reasonCode?: string;
    hasNote?: boolean;
  },
): Promise<string> {
  const audit = await auditRepo.createAuditLog(
    {
      tenantId: context.tenantId,
      storeId: context.storeId,
      userId: context.userId,
      action: data.action,
      entity: 'Payment',
      entityId: data.paymentId,
      metadata: {
        orderId: data.orderId,
        source: data.source ?? 'DASHBOARD',
        previousStatus: data.previousStatus,
        nextStatus: data.nextStatus,
        previousOrderVersion: data.previousVersion,
        nextOrderVersion: data.nextVersion,
        ...(data.reasonCode ? { reasonCode: data.reasonCode } : {}),
        ...(data.hasNote !== undefined ? { hasNote: data.hasNote } : {}),
      },
    },
    tx,
  );
  return audit.id;
}

export async function writeOrderCreatedAudit(
  tx: Prisma.TransactionClient,
  data: {
    tenantId: string;
    storeId: string;
    orderId: string;
    orderNumber: number;
  },
): Promise<string> {
  const audit = await auditRepo.createAuditLog(
    {
      tenantId: data.tenantId,
      storeId: data.storeId,
      userId: null,
      action: 'ORDER_CREATED',
      entity: 'Order',
      entityId: data.orderId,
      metadata: {
        source: 'CUSTOMER',
        orderNumber: data.orderNumber,
        previousStatus: null,
        nextStatus: 'PENDING',
        previousVersion: null,
        nextVersion: 0,
      },
    },
    tx,
  );
  return audit.id;
}

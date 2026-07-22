import 'server-only';

import type { OrderModality, OrderStatus, PaymentMethodType, Prisma } from '@prisma/client';

import { canTransitionOrder } from '@/domain/orders/order-workflow';
import { canTransitionPayment } from '@/domain/orders/payment-workflow';
import { getOrderCapabilities } from '@/features/orders/capabilities';
import type { OrderHistoryInput } from '@/features/orders/query-schemas';
import { normalizePhone } from '@/lib/brazil';
import { decodeOrderCursor, encodeOrderCursor } from '@/lib/orders/cursor';
import { getStoreDayRangeUtc } from '@/lib/time/store-time';
import { getDb } from '@/server/database/client';
import { NotFoundError, OrderPaymentConsistencyError } from '@/server/errors';
import type { TenantRole } from '@/server/permissions';
import { hasTenantPermission, Permission } from '@/server/permissions';
import type {
  ActiveOrderCountsDTO,
  DailyOrderMetricsDTO,
  OrderAllowedActionsDTO,
  OrderDetailsDTO,
  OrderHistoryItemDTO,
  OrderHistoryPageDTO,
  PaymentHistoryItemDTO,
  OrderNotificationSignalsDTO,
  OrderQueueFilters,
  OrderQueuePageDTO,
} from '@/types/order-query';

const ACTIVE_STATUSES: OrderStatus[] = [
  'PENDING',
  'CONFIRMED',
  'PREPARING',
  'READY',
  'OUT_FOR_DELIVERY',
];
const ABNORMAL_ACTIVE_ORDER_COUNT = 500;
const MAX_UNDATED_SEARCH_DAYS = 90;
const SLOW_QUERY_MS = 750;
const NOTIFICATION_SIGNAL_PAGE_SIZE = 50;
const NOTIFICATION_OVERLAP_MS = 5 * 60 * 1_000;
const NOTIFICATION_SEEN_EVENT_LIMIT = 5_000;
const MAX_NOTIFICATION_CURSOR_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

export interface OrderQueryContext {
  tenantId: string;
  storeId: string;
  timeZone: string;
  userId: string;
  tenantRole: TenantRole;
}

function orderIdFromAudit(entry: {
  entity: string;
  entityId: string | null;
  metadata: Prisma.JsonValue | null;
}) {
  if (entry.entity === 'Order') return entry.entityId;
  if (
    entry.entity === 'Payment' &&
    entry.metadata &&
    typeof entry.metadata === 'object' &&
    !Array.isArray(entry.metadata) &&
    typeof entry.metadata.orderId === 'string'
  ) {
    return entry.metadata.orderId;
  }
  return null;
}

export async function getOrderNotificationSignals(
  context: OrderQueryContext,
  cursor?: string,
  seenEventIds: string[] = [],
): Promise<OrderNotificationSignalsDTO> {
  const auditScope = {
    tenantId: context.tenantId,
    storeId: context.storeId,
    entity: { in: ['Order', 'Payment'] },
  } satisfies Prisma.AuditLogWhereInput;

  if (!cursor) {
    const watermark = new Date();
    const baseline = await measured('notification-baseline', context, () =>
      getDb().auditLog.findMany({
        where: {
          ...auditScope,
          createdAt: { gte: new Date(watermark.getTime() - NOTIFICATION_OVERLAP_MS) },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: NOTIFICATION_SEEN_EVENT_LIMIT,
        select: { id: true, createdAt: true },
      }),
    );
    const latest = baseline[0];
    const baselineCursor =
      latest && latest.createdAt > watermark
        ? { createdAt: latest.createdAt, id: latest.id }
        : { createdAt: watermark, id: MAX_NOTIFICATION_CURSOR_ID };
    return {
      items: [],
      processedEventIds: [...baseline].reverse().map((entry) => entry.id),
      hasMore: false,
      nextCursor: encodeOrderCursor(baselineCursor),
    };
  }

  const after = decodeOrderCursor(cursor);
  const overlapStart = new Date(after.createdAt.getTime() - NOTIFICATION_OVERLAP_MS);
  const rows = await measured('notification-signals', context, () =>
    getDb().auditLog.findMany({
      where: {
        ...auditScope,
        id: seenEventIds.length ? { notIn: seenEventIds } : undefined,
        OR: [
          { createdAt: { gt: after.createdAt } },
          { createdAt: after.createdAt, id: { gt: after.id } },
          ...(seenEventIds.length && seenEventIds.length < NOTIFICATION_SEEN_EVENT_LIMIT
            ? [{ createdAt: { gte: overlapStart } }]
            : []),
        ],
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: NOTIFICATION_SIGNAL_PAGE_SIZE + 1,
      select: {
        id: true,
        action: true,
        entity: true,
        entityId: true,
        metadata: true,
        createdAt: true,
      },
    }),
  );
  const page = rows.slice(0, NOTIFICATION_SIGNAL_PAGE_SIZE);
  const orderIds = [
    ...new Set(page.map(orderIdFromAudit).filter((id): id is string => Boolean(id))),
  ];
  const orders = orderIds.length
    ? await measured('notification-orders', context, () =>
        getDb().order.findMany({
          where: {
            id: { in: orderIds },
            tenantId: context.tenantId,
            storeId: context.storeId,
          },
          select: { id: true, orderNumber: true },
        }),
      )
    : [];
  const orderNumbers = new Map(orders.map((order) => [order.id, order.orderNumber]));
  const latest = page.at(-1);
  const latestIsAfterCursor = Boolean(
    latest &&
    (latest.createdAt > after.createdAt ||
      (latest.createdAt.getTime() === after.createdAt.getTime() && latest.id > after.id)),
  );

  return {
    items: page.flatMap((row) => {
      const orderId = orderIdFromAudit(row);
      const orderNumber = orderId ? orderNumbers.get(orderId) : undefined;
      return orderId && orderNumber !== undefined
        ? [
            {
              eventId: row.id,
              orderId,
              orderNumber,
              isNew: row.action === 'ORDER_CREATED',
              createdAt: row.createdAt.toISOString(),
            },
          ]
        : [];
    }),
    processedEventIds: page.map((row) => row.id),
    hasMore: rows.length > NOTIFICATION_SIGNAL_PAGE_SIZE,
    nextCursor:
      latestIsAfterCursor && latest
        ? encodeOrderCursor({ createdAt: latest.createdAt, id: latest.id })
        : cursor,
  };
}

async function measured<T>(
  operation: string,
  context: Pick<OrderQueryContext, 'tenantId' | 'storeId'>,
  query: () => Promise<T>,
): Promise<T> {
  const startedAt = Date.now();
  try {
    return await query();
  } finally {
    const durationMs = Date.now() - startedAt;
    if (durationMs >= SLOW_QUERY_MS) {
      console.warn('[SLOW_ORDER_QUERY]', {
        operation,
        tenantId: context.tenantId,
        storeId: context.storeId,
        durationMs,
      });
    }
  }
}

function searchConditions(query: string): Prisma.OrderWhereInput[] {
  const normalized = query.replace(/^#/, '');
  const orderNumber = /^\d+$/.test(normalized) ? Number(normalized) : null;
  const lowerQuery = query.toLocaleLowerCase('pt-BR');
  const phoneDigits = query.replace(/\D/g, '');
  const phone =
    phoneDigits.length >= 2 && phoneDigits.length < 10 && !phoneDigits.startsWith('55')
      ? `55${phoneDigits}`
      : normalizePhone(query);
  const modalities: OrderModality[] = [];
  const paymentMethods: PaymentMethodType[] = [];

  if ('entrega'.includes(lowerQuery) || lowerQuery.includes('delivery'))
    modalities.push('DELIVERY');
  if ('retirada'.includes(lowerQuery) || lowerQuery.includes('pickup')) modalities.push('PICKUP');
  if (lowerQuery.includes('pix')) paymentMethods.push('PIX');
  if (lowerQuery.includes('dinheiro')) paymentMethods.push('CASH');
  if (lowerQuery.includes('cartao') || lowerQuery.includes('cartão')) {
    paymentMethods.push('CARD_ON_DELIVERY');
  }

  return [
    { customerName: { contains: query, mode: 'insensitive' } },
    ...(phone.length >= 2 ? [{ customerPhoneNormalized: { startsWith: phone } }] : []),
    ...(orderNumber === null ? [] : [{ orderNumber }]),
    ...(modalities.length ? [{ modality: { in: modalities } }] : []),
    ...(paymentMethods.length ? [{ paymentMethod: { in: paymentMethods } }] : []),
  ];
}

function historyItem(entry: {
  id: string;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  actorNameSnapshot: string | null;
  source: OrderHistoryItemDTO['source'];
  reasonCode: string | null;
  note: string | null;
  isUndo: boolean;
  versionFrom: number | null;
  versionTo: number | null;
  createdAt: Date;
}): OrderHistoryItemDTO {
  return {
    id: entry.id,
    fromStatus: entry.fromStatus,
    toStatus: entry.toStatus,
    actorName: entry.actorNameSnapshot ?? (entry.source === 'CUSTOMER' ? 'Cliente' : 'Sistema'),
    source: entry.source,
    reasonCode: entry.reasonCode,
    note: entry.note,
    isUndo: entry.isUndo,
    versionFrom: entry.versionFrom,
    versionTo: entry.versionTo,
    createdAt: entry.createdAt.toISOString(),
  };
}

function paymentHistoryItem(entry: {
  id: string;
  fromStatus: PaymentHistoryItemDTO['previousStatus'] | null;
  toStatus: PaymentHistoryItemDTO['nextStatus'];
  actorNameSnapshot: string | null;
  source: PaymentHistoryItemDTO['source'];
  reasonCode: string | null;
  note: string | null;
  createdAt: Date;
}): PaymentHistoryItemDTO {
  return {
    id: entry.id,
    action: `${entry.fromStatus ?? 'INITIAL'}_${entry.toStatus}`,
    previousStatus: entry.fromStatus ?? entry.toStatus,
    nextStatus: entry.toStatus,
    actorName: entry.actorNameSnapshot ?? (entry.source === 'CUSTOMER' ? 'Cliente' : 'Sistema'),
    source: entry.source,
    reasonCode: entry.reasonCode,
    note: entry.note,
    createdAt: entry.createdAt.toISOString(),
  };
}

export async function getOrderQueue(
  context: OrderQueryContext,
  filters: OrderQueueFilters,
): Promise<OrderQueuePageDTO> {
  return measured('getOrderQueue', context, async () => {
    const cursor = filters.cursor ? decodeOrderCursor(filters.cursor) : null;
    const and: Prisma.OrderWhereInput[] = [];
    const selectedStatuses = filters.statuses ?? (filters.status ? [filters.status] : []);
    const prioritizeOldest =
      selectedStatuses.length > 0 &&
      selectedStatuses.every((status) => ACTIVE_STATUSES.includes(status));

    if (filters.date) {
      const range = getStoreDayRangeUtc(filters.date, context.timeZone);
      and.push({ createdAt: { gte: range.start, lt: range.end } });
    } else if (filters.query) {
      and.push({ createdAt: { gte: new Date(Date.now() - MAX_UNDATED_SEARCH_DAYS * 86_400_000) } });
    }

    if (filters.query) and.push({ OR: searchConditions(filters.query) });
    if (cursor) {
      and.push({
        OR: [
          { createdAt: { [prioritizeOldest ? 'gt' : 'lt']: cursor.createdAt } },
          { createdAt: cursor.createdAt, id: { [prioritizeOldest ? 'gt' : 'lt']: cursor.id } },
        ],
      });
    }

    const where: Prisma.OrderWhereInput = {
      tenantId: context.tenantId,
      storeId: context.storeId,
      status: filters.statuses?.length ? { in: filters.statuses } : filters.status,
      paymentStatus: filters.paymentStatus,
      modality: filters.modality,
      AND: and.length ? and : undefined,
    };

    const [orders, activeOrderCount] = await Promise.all([
      getDb().order.findMany({
        where,
        orderBy: [
          { createdAt: prioritizeOldest ? 'asc' : 'desc' },
          { id: prioritizeOldest ? 'asc' : 'desc' },
        ],
        take: filters.pageSize + 1,
        select: {
          id: true,
          orderNumber: true,
          customerName: true,
          modality: true,
          paymentMethod: true,
          paymentStatus: true,
          status: true,
          total: true,
          createdAt: true,
          statusChangedAt: true,
          version: true,
          notes: true,
          _count: { select: { items: true } },
          items: { where: { notes: { not: null } }, take: 1, select: { id: true } },
        },
      }),
      cursor
        ? Promise.resolve(null)
        : getDb().order.count({
            where: {
              tenantId: context.tenantId,
              storeId: context.storeId,
              status: { in: ACTIVE_STATUSES },
            },
          }),
    ]);

    const hasNextPage = orders.length > filters.pageSize;
    const page = hasNextPage ? orders.slice(0, filters.pageSize) : orders;
    const last = page.at(-1);
    if (activeOrderCount !== null && activeOrderCount > ABNORMAL_ACTIVE_ORDER_COUNT) {
      console.warn('[ABNORMAL_ACTIVE_ORDER_VOLUME]', {
        tenantId: context.tenantId,
        storeId: context.storeId,
        activeOrderCount,
      });
    }

    return {
      items: page.map((order) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        customerDisplayName: order.customerName,
        modality: order.modality,
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
        status: order.status,
        total: order.total,
        itemCount: order._count.items,
        createdAt: order.createdAt.toISOString(),
        statusChangedAt: order.statusChangedAt.toISOString(),
        version: order.version,
        hasCustomerNotes: Boolean(order.notes) || order.items.length > 0,
        hasInternalAlerts: false,
      })),
      nextCursor:
        hasNextPage && last ? encodeOrderCursor({ createdAt: last.createdAt, id: last.id }) : null,
      activeOrderCount,
      hasAbnormalActiveVolume:
        activeOrderCount !== null && activeOrderCount > ABNORMAL_ACTIVE_ORDER_COUNT,
    };
  });
}

function allowedActions(
  context: OrderQueryContext,
  order: {
    status: OrderStatus;
    modality: OrderModality;
    paymentMethod: PaymentMethodType;
    paymentStatus: OrderDetailsDTO['payment']['status'];
    version: number;
  },
  latestHistory: {
    changedById: string | null;
    source: OrderHistoryItemDTO['source'];
    isUndo: boolean;
    versionTo: number | null;
    createdAt: Date;
  } | null,
): OrderAllowedActionsDTO {
  const capabilities = getOrderCapabilities(context.tenantRole);
  const workflowContext = order;
  const canMove = (status: OrderStatus) => canTransitionOrder(workflowContext, status);
  const undoRecent = latestHistory
    ? Date.now() - latestHistory.createdAt.getTime() <= 2 * 60 * 1000
    : false;
  const completionPaymentAllowed =
    order.paymentStatus === 'PAID' ||
    (order.paymentMethod !== 'PIX' && capabilities.canConfirmPayment);
  const paymentWorkflowContext = {
    status: order.paymentStatus,
    method: order.paymentMethod,
    orderStatus: order.status,
  };

  return {
    accept: capabilities.canAcceptOrder && canMove('CONFIRMED'),
    startPreparation: capabilities.canStartPreparation && canMove('PREPARING'),
    markReady: capabilities.canMarkReady && canMove('READY'),
    dispatch: capabilities.canDispatch && canMove('OUT_FOR_DELIVERY'),
    complete: capabilities.canComplete && completionPaymentAllowed && canMove('DELIVERED'),
    cancel: capabilities.canCancel && order.paymentStatus !== 'PAID' && canMove('CANCELLED'),
    confirmPayment:
      capabilities.canConfirmPayment &&
      canTransitionPayment(paymentWorkflowContext, 'CONFIRM_MANUALLY'),
    markPaymentFailed:
      capabilities.canReviewPayment && canTransitionPayment(paymentWorkflowContext, 'MARK_FAILED'),
    retryPayment:
      capabilities.canReviewPayment && canTransitionPayment(paymentWorkflowContext, 'RETRY_FAILED'),
    refundPayment:
      capabilities.canRefundPayment && canTransitionPayment(paymentWorkflowContext, 'REFUND'),
    undo: Boolean(
      latestHistory &&
      latestHistory.changedById === context.userId &&
      latestHistory.source === 'DASHBOARD' &&
      !latestHistory.isUndo &&
      latestHistory.versionTo === order.version &&
      undoRecent &&
      ['CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY'].includes(order.status),
    ),
  };
}

export async function getOrderDetails(
  context: OrderQueryContext,
  orderId: string,
): Promise<OrderDetailsDTO> {
  return measured('getOrderDetails', context, async () => {
    const capabilities = getOrderCapabilities(context.tenantRole);
    const database = getDb();
    const order = await database.order.findFirst({
      where: { id: orderId, tenantId: context.tenantId, storeId: context.storeId },
      select: {
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
        paymentStatus: true,
        status: true,
        notes: true,
        version: true,
        createdAt: true,
        statusChangedAt: true,
        cancellationReasonCode: true,
        cancellationNote: true,
        cancelledAt: true,
        items: {
          orderBy: { id: 'asc' },
          select: {
            id: true,
            productName: true,
            unitPrice: true,
            quantity: true,
            notes: true,
            itemTotal: true,
            options: {
              orderBy: { id: 'asc' },
              select: { id: true, optionName: true, optionPrice: true },
            },
          },
        },
        payment: {
          select: {
            id: true,
            method: true,
            status: true,
            amount: true,
            paidAt: true,
            reportedAt: true,
            failedAt: true,
            failureReasonCode: true,
            cancelledAt: true,
            refundedAt: true,
            refundReasonCode: true,
            refundAmount: true,
          },
        },
        statusHistory: {
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 8,
          select: {
            id: true,
            fromStatus: true,
            toStatus: true,
            actorNameSnapshot: true,
            changedById: true,
            source: true,
            reasonCode: true,
            note: true,
            isUndo: true,
            versionFrom: true,
            versionTo: true,
            createdAt: true,
          },
        },
      },
    });

    if (!order) throw new NotFoundError('Pedido');
    if (
      !order.payment ||
      order.payment.method !== order.paymentMethod ||
      order.payment.status !== order.paymentStatus ||
      order.payment.amount !== order.total
    ) {
      throw new OrderPaymentConsistencyError();
    }
    const latestHistory = order.statusHistory[0] ?? null;
    const paymentHistory = capabilities.canViewHistory
      ? await database.paymentStatusHistory.findMany({
          where: {
            tenantId: context.tenantId,
            storeId: context.storeId,
            orderId: order.id,
            paymentId: order.payment.id,
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 8,
          select: {
            id: true,
            fromStatus: true,
            toStatus: true,
            actorNameSnapshot: true,
            source: true,
            reasonCode: true,
            note: true,
            createdAt: true,
          },
        })
      : [];

    return {
      id: order.id,
      orderNumber: order.orderNumber,
      customer: {
        name: order.customerName,
        phone: capabilities.canViewCustomerContact ? order.customerPhone : null,
      },
      modality: order.modality,
      delivery: {
        address: capabilities.canViewCustomerContact ? order.deliveryAddress : null,
        zoneName: order.deliveryZoneName,
      },
      items: order.items.map((item) => ({
        id: item.id,
        productName: item.productName,
        unitPrice: item.unitPrice,
        quantity: item.quantity,
        notes: item.notes,
        itemTotal: item.itemTotal,
        options: item.options.map((option) => ({
          id: option.id,
          name: option.optionName,
          price: option.optionPrice,
        })),
      })),
      totals: {
        subtotal: order.subtotal,
        discount: order.discount,
        deliveryFee: order.deliveryFee,
        total: order.total,
      },
      payment: {
        method: order.paymentMethod,
        status: order.paymentStatus,
        changeFor: capabilities.canViewPaymentDetails ? order.changeFor : null,
        amount: capabilities.canViewPaymentDetails ? order.payment.amount : null,
        paidAt:
          capabilities.canViewPaymentDetails && order.payment.paidAt
            ? order.payment.paidAt.toISOString()
            : null,
        reportedAt:
          capabilities.canViewPaymentDetails && order.payment.reportedAt
            ? order.payment.reportedAt.toISOString()
            : null,
        failedAt:
          capabilities.canViewPaymentDetails && order.payment.failedAt
            ? order.payment.failedAt.toISOString()
            : null,
        failureReasonCode: capabilities.canViewPaymentDetails
          ? order.payment.failureReasonCode
          : null,
        cancelledAt:
          capabilities.canViewPaymentDetails && order.payment.cancelledAt
            ? order.payment.cancelledAt.toISOString()
            : null,
        refundedAt:
          capabilities.canViewPaymentDetails && order.payment.refundedAt
            ? order.payment.refundedAt.toISOString()
            : null,
        refundReasonCode: capabilities.canViewPaymentDetails
          ? order.payment.refundReasonCode
          : null,
        refundAmount: capabilities.canViewPaymentDetails ? order.payment.refundAmount : null,
      },
      status: order.status,
      customerNotes: order.notes,
      cancellation: {
        reasonCode: capabilities.canViewHistory ? order.cancellationReasonCode : null,
        note: capabilities.canViewHistory ? order.cancellationNote : null,
        cancelledAt: order.cancelledAt?.toISOString() ?? null,
      },
      recentHistory: capabilities.canViewHistory ? order.statusHistory.map(historyItem) : [],
      recentPaymentHistory: paymentHistory.map((entry) => ({
        ...paymentHistoryItem(entry),
        reasonCode: capabilities.canViewPaymentDetails ? entry.reasonCode : null,
        note: capabilities.canViewPaymentDetails ? entry.note : null,
      })),
      version: order.version,
      createdAt: order.createdAt.toISOString(),
      statusChangedAt: order.statusChangedAt.toISOString(),
      lastChangedBy: capabilities.canViewHistory
        ? (latestHistory?.actorNameSnapshot ?? null)
        : null,
      allowedActions: allowedActions(context, order, latestHistory),
    };
  });
}

export async function getOrderHistory(
  context: OrderQueryContext,
  orderId: string,
  input: Pick<OrderHistoryInput, 'cursor' | 'pageSize'>,
): Promise<OrderHistoryPageDTO> {
  return measured('getOrderHistory', context, async () => {
    const order = await getDb().order.findFirst({
      where: { id: orderId, tenantId: context.tenantId, storeId: context.storeId },
      select: { id: true },
    });
    if (!order) throw new NotFoundError('Pedido');

    const cursor = input.cursor ? decodeOrderCursor(input.cursor) : null;
    const entries = await getDb().orderStatusHistory.findMany({
      where: {
        orderId,
        OR: cursor
          ? [
              { createdAt: { lt: cursor.createdAt } },
              { createdAt: cursor.createdAt, id: { lt: cursor.id } },
            ]
          : undefined,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: input.pageSize + 1,
      select: {
        id: true,
        fromStatus: true,
        toStatus: true,
        actorNameSnapshot: true,
        source: true,
        reasonCode: true,
        note: true,
        isUndo: true,
        versionFrom: true,
        versionTo: true,
        createdAt: true,
      },
    });
    const hasNextPage = entries.length > input.pageSize;
    const page = hasNextPage ? entries.slice(0, input.pageSize) : entries;
    const last = page.at(-1);

    return {
      items: page.map(historyItem),
      nextCursor:
        hasNextPage && last ? encodeOrderCursor({ createdAt: last.createdAt, id: last.id }) : null,
    };
  });
}

interface DurationMetricsRow {
  averageAcceptanceMinutes: number | null;
  averagePreparationMinutes: number | null;
}

export async function getDailyOrderMetrics(
  context: OrderQueryContext,
  localDate: string,
): Promise<DailyOrderMetricsDTO> {
  return measured('getDailyOrderMetrics', context, async () => {
    const range = getStoreDayRangeUtc(localDate, context.timeZone);
    const financialMetricsVisible = hasTenantPermission(
      context.tenantRole,
      Permission.VIEW_BASIC_REPORTS,
    );
    const scope = {
      tenantId: context.tenantId,
      storeId: context.storeId,
      createdAt: { gte: range.start, lt: range.end },
    } satisfies Prisma.OrderWhereInput;

    const [statusGroups, gross, paymentGroups, durations] = await Promise.all([
      getDb().order.groupBy({
        by: ['status'],
        where: scope,
        _count: { _all: true },
      }),
      financialMetricsVisible
        ? getDb().order.aggregate({
            where: { ...scope, status: { not: 'CANCELLED' } },
            _count: { _all: true },
            _sum: { total: true },
          })
        : Promise.resolve(null),
      financialMetricsVisible
        ? getDb().order.groupBy({
            by: ['paymentStatus'],
            where: { ...scope, status: { not: 'CANCELLED' } },
            _count: { _all: true },
            _sum: { total: true },
          })
        : Promise.resolve([]),
      getDb().$queryRaw<DurationMetricsRow[]>`
        SELECT
          AVG(EXTRACT(EPOCH FROM ("acceptedAt" - "createdAt")) / 60.0)::double precision AS "averageAcceptanceMinutes",
          AVG(EXTRACT(EPOCH FROM ("readyAt" - "preparingAt")) / 60.0)::double precision AS "averagePreparationMinutes"
        FROM "orders"
        WHERE "tenantId" = ${context.tenantId}
          AND "storeId" = ${context.storeId}
          AND "createdAt" >= ${range.start}
          AND "createdAt" < ${range.end}
      `,
    ]);

    const countByStatus = new Map(statusGroups.map((group) => [group.status, group._count._all]));
    const paymentByStatus = new Map(
      paymentGroups.map((group) => [
        group.paymentStatus,
        { count: group._count._all, total: group._sum.total ?? 0 },
      ]),
    );
    const grossSales = gross?._sum.total ?? null;
    const nonCancelledCount = gross?._count._all ?? 0;
    const duration = durations[0];

    return {
      financialMetricsVisible,
      orderCount: statusGroups.reduce((total, group) => total + group._count._all, 0),
      activeCount: ACTIVE_STATUSES.reduce(
        (total, status) => total + (countByStatus.get(status) ?? 0),
        0,
      ),
      completedCount: countByStatus.get('DELIVERED') ?? 0,
      cancelledCount: countByStatus.get('CANCELLED') ?? 0,
      grossSales,
      paidRevenue: financialMetricsVisible ? (paymentByStatus.get('PAID')?.total ?? 0) : null,
      pendingRevenue: financialMetricsVisible
        ? (paymentByStatus.get('PENDING')?.total ?? 0) +
          (paymentByStatus.get('CUSTOMER_REPORTED_PAID')?.total ?? 0)
        : null,
      averageTicket:
        financialMetricsVisible && grossSales !== null && nonCancelledCount > 0
          ? Math.round(grossSales / nonCancelledCount)
          : null,
      pendingPaymentCount: financialMetricsVisible
        ? (paymentByStatus.get('PENDING')?.count ?? 0) +
          (paymentByStatus.get('CUSTOMER_REPORTED_PAID')?.count ?? 0)
        : null,
      averageAcceptanceMinutes: duration?.averageAcceptanceMinutes ?? null,
      averagePreparationMinutes: duration?.averagePreparationMinutes ?? null,
    };
  });
}

export async function getActiveOrderCounts(
  context: OrderQueryContext,
): Promise<ActiveOrderCountsDTO> {
  return measured('getActiveOrderCounts', context, async () => {
    const groups = await getDb().order.groupBy({
      by: ['status'],
      where: {
        tenantId: context.tenantId,
        storeId: context.storeId,
        status: { in: ACTIVE_STATUSES },
      },
      _count: { _all: true },
    });
    const counts = new Map(groups.map((group) => [group.status, group._count._all]));
    return {
      total: groups.reduce((total, group) => total + group._count._all, 0),
      pending: counts.get('PENDING') ?? 0,
      preparing: (counts.get('CONFIRMED') ?? 0) + (counts.get('PREPARING') ?? 0),
      ready: (counts.get('READY') ?? 0) + (counts.get('OUT_FOR_DELIVERY') ?? 0),
    };
  });
}

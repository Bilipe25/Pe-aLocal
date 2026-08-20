import 'server-only';

import {
  Prisma,
  type OrderModality,
  type OrderStatus,
  type PaymentMethodType,
} from '@prisma/client';

import {
  getOrderOperationalSnapshot,
  getOrderStageAlertThresholdMinutes,
} from '@/domain/orders/order-operations';
import {
  ORDER_OPERATIONAL_SLA_CRITICAL_MINUTES,
  ORDER_OPERATIONAL_SLA_WARNING_MINUTES,
} from '@/domain/orders/operational-sla';
import {
  canTransitionOrder,
  getNextOperationalAction,
  getOrderWorkflowLabel,
  type OrderOperationalAction,
} from '@/domain/orders/order-workflow';
import { canTransitionPayment } from '@/domain/orders/payment-workflow';
import { getOrderCapabilities } from '@/features/orders/capabilities';
import {
  ORDER_BOARD_LANE_PAGE_SIZE,
  ORDER_NOTIFICATION_SEEN_EVENT_LIMIT,
} from '@/features/orders/query-constants';
import type { OrderBoardLaneInput, OrderHistoryInput } from '@/features/orders/query-schemas';
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
  OrderBoardFilters,
  OrderBoardItemDTO,
  OrderBoardLaneDTO,
  OrderBoardLaneKey,
  OrderBoardSnapshotDTO,
  OrderAllowedActionsDTO,
  OrderDetailsDTO,
  OrderHistoryItemDTO,
  OrderHistoryPageDTO,
  PaymentHistoryItemDTO,
  OrderNotificationSignalsDTO,
  OrderQueueFilters,
  OrderQueuePageDTO,
  OrderOperationalSlaConfigDTO,
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
const MAX_NOTIFICATION_CURSOR_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
const ORDER_READ_TRANSACTION_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
} as const;
const ORDER_BOARD_LANES: OrderBoardLaneKey[] = [
  'NEW',
  'PREPARATION',
  'READY_AND_DELIVERY',
  'FINISHED',
];
const ORDER_BOARD_LANE_STATUSES: Record<OrderBoardLaneKey, OrderStatus[]> = {
  NEW: ['PENDING'],
  PREPARATION: ['CONFIRMED', 'PREPARING'],
  READY_AND_DELIVERY: ['READY', 'OUT_FOR_DELIVERY'],
  FINISHED: ['DELIVERED', 'CANCELLED'],
};

const ORDER_BOARD_ITEM_SELECT = {
  id: true,
  orderNumber: true,
  customerName: true,
  modality: true,
  diningTableLabelSnapshot: true,
  paymentMethod: true,
  paymentStatus: true,
  status: true,
  total: true,
  createdAt: true,
  statusChangedAt: true,
  operationalStartedAt: true,
  acceptedAt: true,
  preparingAt: true,
  readyAt: true,
  dispatchedAt: true,
  deliveredAt: true,
  cancelledAt: true,
  promisedFulfillmentMinAt: true,
  promisedFulfillmentMaxAt: true,
  version: true,
  notes: true,
  items: {
    orderBy: [{ position: 'asc' as const }, { id: 'asc' as const }],
    select: { id: true, productName: true, quantity: true, notes: true },
  },
} satisfies Prisma.OrderSelect;

type OrderBoardRow = Prisma.OrderGetPayload<{ select: typeof ORDER_BOARD_ITEM_SELECT }>;
type OrderReadClient = Pick<Prisma.TransactionClient, 'order' | 'auditLog' | '$queryRaw'>;

export interface OrderBoardBootstrapDTO {
  notificationBaseline: OrderNotificationSignalsDTO;
  initialBoard: OrderBoardSnapshotDTO;
}

export interface OrderBoardTemporalSummaryDTO {
  delayedCount: number;
  asOf: string;
  operationalSla: OrderOperationalSlaConfigDTO;
}

export interface OrderQueryContext {
  tenantId: string;
  storeId: string;
  timeZone: string;
  userId: string;
  tenantRole: TenantRole;
  estimatedTimeMaxMinutes?: number;
  operationalSlaEnabled?: boolean;
  operationalSlaEnabledAt?: Date | null;
}

function operationalSlaConfig(context: OrderQueryContext): OrderOperationalSlaConfigDTO {
  const enabled = Boolean(context.operationalSlaEnabled && context.operationalSlaEnabledAt);
  return {
    enabled,
    enabledAt: enabled ? (context.operationalSlaEnabledAt?.toISOString() ?? null) : null,
    warningMinutes: ORDER_OPERATIONAL_SLA_WARNING_MINUTES,
    criticalMinutes: ORDER_OPERATIONAL_SLA_CRITICAL_MINUTES,
  };
}

function operationalSlaDomainConfig(context: OrderQueryContext) {
  return {
    enabled: Boolean(context.operationalSlaEnabled && context.operationalSlaEnabledAt),
    enabledAt: context.operationalSlaEnabledAt ?? null,
  };
}

function orderIdFromAudit(entry: {
  entity: string;
  entityId: string | null;
  metadata: Prisma.JsonValue | null;
}) {
  if (entry.entity === 'Order') return entry.entityId;
  if (
    (entry.entity === 'Payment' || entry.entity === 'OrderInternalNote') &&
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
    entity: { in: ['Order', 'Payment', 'OrderInternalNote'] },
  } satisfies Prisma.AuditLogWhereInput;

  if (!cursor) {
    return measured('notification-baseline', context, () =>
      getDb().$transaction(async (tx) => {
        const watermark = await getDatabaseWatermark(tx);
        return loadOrderNotificationBaseline(context, tx, watermark);
      }, ORDER_READ_TRANSACTION_OPTIONS),
    );
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
          ...(seenEventIds.length < ORDER_NOTIFICATION_SEEN_EVENT_LIMIT
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

async function getDatabaseWatermark(database: Pick<OrderReadClient, '$queryRaw'>): Promise<Date> {
  const rows = await database.$queryRaw<Array<{ watermark: Date }>>(
    Prisma.sql`SELECT CURRENT_TIMESTAMP AS "watermark"`,
  );
  const watermark = rows[0]?.watermark;
  if (!(watermark instanceof Date) || Number.isNaN(watermark.getTime())) {
    throw new Error('Não foi possível obter o watermark do banco para os pedidos.');
  }
  return watermark;
}

async function loadOrderNotificationBaseline(
  context: OrderQueryContext,
  database: Pick<OrderReadClient, 'auditLog'>,
  watermark: Date,
): Promise<OrderNotificationSignalsDTO> {
  const baseline = await database.auditLog.findMany({
    where: {
      tenantId: context.tenantId,
      storeId: context.storeId,
      entity: { in: ['Order', 'Payment', 'OrderInternalNote'] },
      createdAt: { gte: new Date(watermark.getTime() - NOTIFICATION_OVERLAP_MS) },
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: ORDER_NOTIFICATION_SEEN_EVENT_LIMIT,
    select: { id: true, createdAt: true },
  });
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
  const parsedOrderNumber = /^\d+$/.test(normalized) ? Number(normalized) : null;
  const orderNumber =
    parsedOrderNumber !== null &&
    Number.isSafeInteger(parsedOrderNumber) &&
    parsedOrderNumber > 0 &&
    parsedOrderNumber <= 2_147_483_647
      ? parsedOrderNumber
      : null;
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
  if (lowerQuery.includes('salao') || lowerQuery.includes('salão') || lowerQuery.includes('mesa')) {
    modalities.push('DINE_IN');
  }
  if (lowerQuery.includes('pix')) paymentMethods.push('PIX');
  if (lowerQuery.includes('dinheiro')) paymentMethods.push('CASH');
  if (lowerQuery.includes('cartao') || lowerQuery.includes('cartão')) {
    paymentMethods.push('CARD_ON_DELIVERY', 'CARD_IN_PERSON');
  }

  return [
    { customerName: { contains: query, mode: 'insensitive' } },
    { diningTableLabelSnapshot: { contains: query, mode: 'insensitive' } },
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

function nextActionLabel(
  context: OrderQueryContext,
  order: Pick<OrderDetailsDTO, 'status' | 'modality'> & {
    paymentMethod: PaymentMethodType;
    paymentStatus: OrderDetailsDTO['payment']['status'];
  },
) {
  if (order.status === 'AWAITING_PAYMENT') return null;
  const capabilities = getOrderCapabilities(context.tenantRole);
  const action = getNextOperationalAction(order);
  const canConfirmCurrentPayment = canTransitionPayment(
    {
      status: order.paymentStatus,
      method: order.paymentMethod,
      orderStatus: order.status,
    },
    'CONFIRM_MANUALLY',
  );
  const allowed: Record<OrderOperationalAction, boolean> = {
    CONFIRM_ORDER: capabilities.canAcceptOrder,
    START_PREPARATION: capabilities.canStartPreparation,
    MARK_ORDER_READY: capabilities.canMarkReady,
    DISPATCH_FOR_DELIVERY: capabilities.canDispatch,
    CONFIRM_PAYMENT: capabilities.canConfirmPayment && canConfirmCurrentPayment,
    COMPLETE_PICKUP: capabilities.canComplete,
    COMPLETE_DINE_IN: capabilities.canComplete,
    COMPLETE_DELIVERY: capabilities.canComplete,
  };
  return action && allowed[action] ? getOrderWorkflowLabel(action) : null;
}

function boardStatusesForLane(
  lane: OrderBoardLaneKey,
  filters: Pick<OrderBoardFilters, 'statuses' | 'onlyActive' | 'delayedOnly'>,
) {
  if (lane === 'FINISHED' && (filters.onlyActive || filters.delayedOnly)) return [];
  const laneStatuses = ORDER_BOARD_LANE_STATUSES[lane];
  if (!filters.statuses?.length) return laneStatuses;
  const selectedStatuses = new Set<OrderStatus>(filters.statuses);
  return laneStatuses.filter((status) => selectedStatuses.has(status));
}

function orderBoardWhere(
  context: OrderQueryContext,
  filters: OrderBoardFilters,
  statuses: OrderStatus[],
  options: { lane: OrderBoardLaneKey; cursor?: string; now?: Date },
): Prisma.OrderWhereInput {
  const prioritizeOldest = options.lane !== 'FINISHED';
  const timestampField =
    options.lane === 'FINISHED' || options.lane === 'NEW' ? 'statusChangedAt' : 'createdAt';
  const and: Prisma.OrderWhereInput[] = [];

  if (options.lane === 'FINISHED') {
    const range = getStoreDayRangeUtc(filters.localDate, context.timeZone);
    and.push({ statusChangedAt: { gte: range.start, lt: range.end } });
  }
  if (filters.query) and.push({ OR: searchConditions(filters.query) });
  if (filters.delayedOnly && options.lane !== 'FINISHED') {
    and.push(operationalDelayCondition(context, options.now ?? new Date()));
  }
  if (options.cursor) {
    const cursor = decodeOrderCursor(options.cursor);
    and.push({
      OR: [
        { [timestampField]: { [prioritizeOldest ? 'gt' : 'lt']: cursor.createdAt } },
        {
          [timestampField]: cursor.createdAt,
          id: { [prioritizeOldest ? 'gt' : 'lt']: cursor.id },
        },
      ],
    });
  }

  return {
    tenantId: context.tenantId,
    storeId: context.storeId,
    status: { in: statuses },
    paymentStatus: filters.paymentStatus,
    modality: filters.modality,
    AND: and.length ? and : undefined,
  };
}

function boardSummaryWhere(
  context: OrderQueryContext,
  filters: OrderBoardFilters,
): Prisma.OrderWhereInput {
  return {
    tenantId: context.tenantId,
    storeId: context.storeId,
    paymentStatus: filters.paymentStatus,
    modality: filters.modality,
    AND: filters.query ? [{ OR: searchConditions(filters.query) }] : undefined,
  };
}

function delayedOperationalWhere(
  context: OrderQueryContext,
  filters: OrderBoardFilters,
  now: Date,
): Prisma.OrderWhereInput {
  const base = boardSummaryWhere(context, filters);

  return {
    ...base,
    AND: [...(Array.isArray(base.AND) ? base.AND : []), operationalDelayCondition(context, now)],
  };
}

function operationalDelayCondition(context: OrderQueryContext, now: Date): Prisma.OrderWhereInput {
  const minutesAgo = (minutes: number) => new Date(now.getTime() - minutes * 60_000);
  const preparationLimit = Math.max(1, context.estimatedTimeMaxMinutes ?? 50);
  const deliveryLimit = Math.max(15, context.estimatedTimeMaxMinutes ?? 50);

  return {
    OR: [
      ...(context.operationalSlaEnabled && context.operationalSlaEnabledAt
        ? [
            {
              status: 'PENDING' as const,
              statusChangedAt: {
                gte: context.operationalSlaEnabledAt,
                lte: minutesAgo(ORDER_OPERATIONAL_SLA_WARNING_MINUTES),
              },
            },
          ]
        : []),
      {
        status: 'CONFIRMED',
        OR: [
          { acceptedAt: { lte: minutesAgo(5) } },
          { acceptedAt: null, statusChangedAt: { lte: minutesAgo(5) } },
        ],
      },
      {
        status: 'PREPARING',
        OR: [
          { preparingAt: { lte: minutesAgo(preparationLimit) } },
          {
            preparingAt: null,
            statusChangedAt: { lte: minutesAgo(preparationLimit) },
          },
        ],
      },
      {
        status: 'READY',
        modality: 'PICKUP',
        OR: [
          { readyAt: { lte: minutesAgo(15) } },
          { readyAt: null, statusChangedAt: { lte: minutesAgo(15) } },
        ],
      },
      {
        status: 'READY',
        modality: 'DELIVERY',
        OR: [
          { readyAt: { lte: minutesAgo(5) } },
          { readyAt: null, statusChangedAt: { lte: minutesAgo(5) } },
        ],
      },
      {
        status: 'OUT_FOR_DELIVERY',
        OR: [
          { dispatchedAt: { lte: minutesAgo(deliveryLimit) } },
          {
            dispatchedAt: null,
            statusChangedAt: { lte: minutesAgo(deliveryLimit) },
          },
        ],
      },
    ],
  };
}

function boardItem(context: OrderQueryContext, order: OrderBoardRow): OrderBoardItemDTO {
  const operational = getOrderOperationalSnapshot({
    ...order,
    operationalSla: operationalSlaDomainConfig(context),
    estimatedTimeMaxMinutes: context.estimatedTimeMaxMinutes ?? 50,
  });
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    customerDisplayName: order.customerName,
    modality: order.modality,
    diningTableLabel: order.diningTableLabelSnapshot,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    status: order.status,
    total: order.total,
    itemCount: order.items.length,
    itemPreview: order.items.slice(0, 3).map((item) => ({
      id: item.id,
      productName: item.productName,
      quantity: item.quantity,
      notes: item.notes?.slice(0, 120) ?? null,
    })),
    createdAt: order.createdAt.toISOString(),
    statusChangedAt: order.statusChangedAt.toISOString(),
    stageStartedAt: operational.stageStartedAt.toISOString(),
    stageElapsedMinutes: operational.elapsedMinutes,
    stageAlertThresholdMinutes: getOrderStageAlertThresholdMinutes({
      status: order.status,
      modality: order.modality,
      estimatedTimeMaxMinutes: context.estimatedTimeMaxMinutes ?? 50,
    }),
    stageLabel: operational.stageLabel,
    stageAlerts: operational.alerts,
    nextActionLabel: nextActionLabel(context, order),
    version: order.version,
    hasCustomerNotes: Boolean(order.notes) || order.items.some((item) => Boolean(item.notes)),
    hasOperationalAlert: operational.alerts.length > 0,
    promisedFulfillmentMinAt: order.promisedFulfillmentMinAt?.toISOString() ?? null,
    promisedFulfillmentMaxAt: order.promisedFulfillmentMaxAt?.toISOString() ?? null,
  };
}

async function findOrderBoardLaneItems(
  database: Pick<OrderReadClient, 'order'>,
  context: OrderQueryContext,
  filters: OrderBoardFilters,
  lane: OrderBoardLaneKey,
  pageSize: number,
  cursor?: string,
  now?: Date,
) {
  const statuses = boardStatusesForLane(lane, filters);
  if (!statuses.length) return { items: [] as OrderBoardItemDTO[], nextCursor: null };
  const prioritizeOldest = lane !== 'FINISHED';
  const rows = await database.order.findMany({
    where: orderBoardWhere(context, filters, statuses, { lane, cursor, now }),
    orderBy: prioritizeOldest
      ? lane === 'NEW'
        ? [{ statusChangedAt: 'asc' }, { id: 'asc' }]
        : [{ createdAt: 'asc' }, { id: 'asc' }]
      : [{ statusChangedAt: 'desc' }, { id: 'desc' }],
    take: pageSize + 1,
    select: ORDER_BOARD_ITEM_SELECT,
  });
  const hasNextPage = rows.length > pageSize;
  const page = hasNextPage ? rows.slice(0, pageSize) : rows;
  const last = page.at(-1);
  const cursorTimestamp = last
    ? lane === 'FINISHED' || lane === 'NEW'
      ? last.statusChangedAt
      : last.createdAt
    : null;
  return {
    items: page.map((order) => boardItem(context, order)),
    nextCursor:
      hasNextPage && last && cursorTimestamp
        ? encodeOrderCursor({ createdAt: cursorTimestamp, id: last.id })
        : null,
  };
}

function laneTotalFromStatusCounts(
  lane: OrderBoardLaneKey,
  filters: OrderBoardFilters,
  counts: Map<OrderStatus, number>,
) {
  return boardStatusesForLane(lane, filters).reduce(
    (total, status) => total + (counts.get(status) ?? 0),
    0,
  );
}

async function loadOrderBoardSnapshot(
  database: Pick<OrderReadClient, 'order'>,
  context: OrderQueryContext,
  filters: OrderBoardFilters,
  boardNow: Date,
): Promise<OrderBoardSnapshotDTO> {
  const selectedStatuses = filters.statuses?.length ? new Set<OrderStatus>(filters.statuses) : null;
  const activeLaneStatuses = ACTIVE_STATUSES.filter(
    (status) => !selectedStatuses || selectedStatuses.has(status),
  );
  const finishedLaneStatuses = ORDER_BOARD_LANE_STATUSES.FINISHED.filter(
    (status) => !selectedStatuses || selectedStatuses.has(status),
  );
  const activeSummaryWhere = {
    ...boardSummaryWhere(context, filters),
    status: { in: ACTIVE_STATUSES },
  } satisfies Prisma.OrderWhereInput;
  const activeLaneWhere = {
    ...boardSummaryWhere(context, filters),
    status: { in: activeLaneStatuses },
    AND: [
      ...(filters.query ? [{ OR: searchConditions(filters.query) }] : []),
      ...(filters.delayedOnly ? [operationalDelayCondition(context, boardNow)] : []),
    ],
  } satisfies Prisma.OrderWhereInput;
  const finishedRange = getStoreDayRangeUtc(filters.localDate, context.timeZone);
  const finishedWhere = {
    ...boardSummaryWhere(context, filters),
    status: { in: filters.onlyActive || filters.delayedOnly ? [] : finishedLaneStatuses },
    statusChangedAt: { gte: finishedRange.start, lt: finishedRange.end },
  } satisfies Prisma.OrderWhereInput;

  const [summaryGroups, delayedActiveLaneGroups, finishedGroups, delayed, ...laneItems] =
    await Promise.all([
      database.order.groupBy({
        by: ['status'],
        where: activeSummaryWhere,
        _count: { _all: true },
      }),
      filters.delayedOnly && activeLaneStatuses.length
        ? database.order.groupBy({
            by: ['status'],
            where: activeLaneWhere,
            _count: { _all: true },
          })
        : Promise.resolve(null),
      !filters.onlyActive && !filters.delayedOnly && finishedLaneStatuses.length
        ? database.order.groupBy({
            by: ['status'],
            where: finishedWhere,
            _count: { _all: true },
          })
        : Promise.resolve([]),
      filters.delayedOnly && !selectedStatuses
        ? Promise.resolve(null)
        : database.order.count({ where: delayedOperationalWhere(context, filters, boardNow) }),
      ...ORDER_BOARD_LANES.map((lane) =>
        findOrderBoardLaneItems(
          database,
          context,
          filters,
          lane,
          ORDER_BOARD_LANE_PAGE_SIZE,
          undefined,
          boardNow,
        ),
      ),
    ]);

  const summaryCounts = new Map(summaryGroups.map((group) => [group.status, group._count._all]));
  const activeLaneGroups = delayedActiveLaneGroups ?? summaryGroups;
  const laneCounts = new Map<OrderStatus, number>([
    ...activeLaneGroups.map((group) => [group.status, group._count._all] as const),
    ...finishedGroups.map((group) => [group.status, group._count._all] as const),
  ]);
  const lanes = Object.fromEntries(
    ORDER_BOARD_LANES.map((key, index) => [
      key,
      {
        key,
        items: laneItems[index]?.items ?? [],
        total: laneTotalFromStatusCounts(key, filters, laneCounts),
        nextCursor: laneItems[index]?.nextCursor ?? null,
      } satisfies OrderBoardLaneDTO,
    ]),
  ) as Record<OrderBoardLaneKey, OrderBoardLaneDTO>;

  return {
    summary: {
      newCount: summaryCounts.get('PENDING') ?? 0,
      preparingCount: (summaryCounts.get('CONFIRMED') ?? 0) + (summaryCounts.get('PREPARING') ?? 0),
      readyCount: summaryCounts.get('READY') ?? 0,
      deliveryCount: summaryCounts.get('OUT_FOR_DELIVERY') ?? 0,
      delayedCount:
        delayed ?? activeLaneGroups.reduce((total, group) => total + group._count._all, 0),
    },
    lanes,
    operationalSla: operationalSlaConfig(context),
  };
}

export async function getOrderBoardSnapshot(
  context: OrderQueryContext,
  filters: OrderBoardFilters,
): Promise<OrderBoardSnapshotDTO> {
  return measured('getOrderBoardSnapshot', context, () =>
    getDb().$transaction(async (tx) => {
      const boardNow = await getDatabaseWatermark(tx);
      return loadOrderBoardSnapshot(tx, context, filters, boardNow);
    }, ORDER_READ_TRANSACTION_OPTIONS),
  );
}

export async function getOrderBoardBootstrap(
  context: OrderQueryContext,
  filters: OrderBoardFilters,
): Promise<OrderBoardBootstrapDTO> {
  return measured('getOrderBoardBootstrap', context, () =>
    getDb().$transaction(async (tx) => {
      const watermark = await getDatabaseWatermark(tx);
      const notificationBaseline = await loadOrderNotificationBaseline(context, tx, watermark);
      const initialBoard = await loadOrderBoardSnapshot(tx, context, filters, watermark);
      return { notificationBaseline, initialBoard };
    }, ORDER_READ_TRANSACTION_OPTIONS),
  );
}

export async function getOrderBoardTemporalSummary(
  context: OrderQueryContext,
  filters: OrderBoardFilters,
): Promise<OrderBoardTemporalSummaryDTO> {
  return measured('getOrderBoardTemporalSummary', context, () =>
    getDb().$transaction(async (tx) => {
      const asOf = await getDatabaseWatermark(tx);
      const delayedCount = await tx.order.count({
        where: delayedOperationalWhere(context, filters, asOf),
      });
      return {
        delayedCount,
        asOf: asOf.toISOString(),
        operationalSla: operationalSlaConfig(context),
      };
    }, ORDER_READ_TRANSACTION_OPTIONS),
  );
}

export async function getOrderBoardLane(
  context: OrderQueryContext,
  input: OrderBoardLaneInput,
): Promise<OrderBoardLaneDTO> {
  return measured('getOrderBoardLane', context, () =>
    getDb().$transaction(async (tx) => {
      const boardNow = await getDatabaseWatermark(tx);
      const statuses = boardStatusesForLane(input.lane, input);
      if (!statuses.length) {
        return { key: input.lane, items: [], total: 0, nextCursor: null };
      }
      const [page, total] = await Promise.all([
        findOrderBoardLaneItems(
          tx,
          context,
          input,
          input.lane,
          input.pageSize,
          input.cursor,
          boardNow,
        ),
        tx.order.count({
          where: orderBoardWhere(context, input, statuses, { lane: input.lane, now: boardNow }),
        }),
      ]);
      return { key: input.lane, total, ...page };
    }, ORDER_READ_TRANSACTION_OPTIONS),
  );
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
          diningTableLabelSnapshot: true,
          paymentMethod: true,
          paymentStatus: true,
          status: true,
          total: true,
          createdAt: true,
          statusChangedAt: true,
          operationalStartedAt: true,
          acceptedAt: true,
          preparingAt: true,
          readyAt: true,
          dispatchedAt: true,
          deliveredAt: true,
          cancelledAt: true,
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
      items: page.map((order) => {
        const operational = getOrderOperationalSnapshot({
          ...order,
          operationalSla: operationalSlaDomainConfig(context),
          estimatedTimeMaxMinutes: context.estimatedTimeMaxMinutes ?? 50,
        });
        return {
          id: order.id,
          orderNumber: order.orderNumber,
          customerDisplayName: order.customerName,
          modality: order.modality,
          diningTableLabel: order.diningTableLabelSnapshot,
          paymentMethod: order.paymentMethod,
          paymentStatus: order.paymentStatus,
          status: order.status,
          total: order.total,
          itemCount: order._count.items,
          createdAt: order.createdAt.toISOString(),
          statusChangedAt: order.statusChangedAt.toISOString(),
          stageStartedAt: operational.stageStartedAt.toISOString(),
          stageElapsedMinutes: operational.elapsedMinutes,
          stageAlertThresholdMinutes: getOrderStageAlertThresholdMinutes({
            status: order.status,
            modality: order.modality,
            estimatedTimeMaxMinutes: context.estimatedTimeMaxMinutes ?? 50,
          }),
          stageLabel: operational.stageLabel,
          stageAlerts: operational.alerts,
          nextActionLabel: nextActionLabel(context, order),
          version: order.version,
          hasCustomerNotes: Boolean(order.notes) || order.items.length > 0,
          hasOperationalAlert: operational.alerts.length > 0,
        };
      }),
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
    viewCustomerContact: capabilities.canViewCustomerContact,
    viewPaymentDetails: capabilities.canViewPaymentDetails,
    viewHistory: capabilities.canViewHistory,
    addInternalNote: capabilities.canAddInternalNote,
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
        diningTableLabelSnapshot: true,
        deliveryAddress: true,
        deliveryZoneName: true,
        deliveryStreet: true,
        deliveryNumber: true,
        deliveryNeighborhood: true,
        deliveryCity: true,
        deliveryState: true,
        deliveryPostalCode: true,
        promisedFulfillmentMinAt: true,
        promisedFulfillmentMaxAt: true,
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
        operationalStartedAt: true,
        acceptedAt: true,
        preparingAt: true,
        readyAt: true,
        dispatchedAt: true,
        deliveredAt: true,
        cancellationReasonCode: true,
        cancellationNote: true,
        cancelledAt: true,
        items: {
          orderBy: [{ position: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            productName: true,
            unitPrice: true,
            quantity: true,
            notes: true,
            itemTotal: true,
            options: {
              orderBy: [{ groupPosition: 'asc' }, { position: 'asc' }, { id: 'asc' }],
              select: {
                id: true,
                optionName: true,
                optionPrice: true,
                groupName: true,
              },
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
    const operational = getOrderOperationalSnapshot({
      ...order,
      operationalSla: operationalSlaDomainConfig(context),
      estimatedTimeMaxMinutes: context.estimatedTimeMaxMinutes ?? 50,
    });
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
      diningTable: { label: order.diningTableLabelSnapshot },
      delivery: {
        address: capabilities.canViewCustomerContact ? order.deliveryAddress : null,
        zoneName: order.deliveryZoneName,
        street: capabilities.canViewCustomerContact ? order.deliveryStreet : null,
        number: capabilities.canViewCustomerContact ? order.deliveryNumber : null,
        neighborhood: capabilities.canViewCustomerContact ? order.deliveryNeighborhood : null,
        city: capabilities.canViewCustomerContact ? order.deliveryCity : null,
        state: capabilities.canViewCustomerContact ? order.deliveryState : null,
        postalCode: capabilities.canViewCustomerContact ? order.deliveryPostalCode : null,
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
          groupName: option.groupName ?? null,
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
      promisedFulfillmentMinAt: order.promisedFulfillmentMinAt?.toISOString() ?? null,
      promisedFulfillmentMaxAt: order.promisedFulfillmentMaxAt?.toISOString() ?? null,
      acceptedAt: order.acceptedAt?.toISOString() ?? null,
      preparingAt: order.preparingAt?.toISOString() ?? null,
      readyAt: order.readyAt?.toISOString() ?? null,
      dispatchedAt: order.dispatchedAt?.toISOString() ?? null,
      deliveredAt: order.deliveredAt?.toISOString() ?? null,
      cancelledAt: order.cancelledAt?.toISOString() ?? null,
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
      operational: {
        stageLabel: operational.stageLabel,
        stageStartedAt: operational.stageStartedAt.toISOString(),
        elapsedMinutes: operational.elapsedMinutes,
        alerts: operational.alerts,
        durations: operational.durations,
      },
      operationalSla: operationalSlaConfig(context),
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
          AVG(EXTRACT(EPOCH FROM ("acceptedAt" - COALESCE("operationalStartedAt", "createdAt"))) / 60.0)::double precision AS "averageAcceptanceMinutes",
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

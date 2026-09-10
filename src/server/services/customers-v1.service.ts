import 'server-only';

import { Prisma } from '@prisma/client';

import {
  getCustomerRelationshipThresholds,
  relationshipDaysSince,
  type CustomerRelationshipSegment,
} from '@/domain/customers/relationship';
import { normalizePhone } from '@/lib/brazil';
import {
  customerRelationshipFilterSchema,
  customerRelationshipSortSchema,
} from '@/schemas/customer-relationship';
import { getDb } from '@/server/database/client';
import { AuthorizationError, NotFoundError } from '@/server/errors';
import { isTenantAdmin, Permission } from '@/server/permissions';
import { getCustomerRepurchaseShortcuts } from '@/server/services/consumer-repurchase.service';
import { refreshCustomerRelationshipSegments } from '@/server/services/customer-relationship.service';
import { getCustomerLoyaltySummary } from '@/server/services/loyalty.service';
import { requireActiveStoreContext } from '@/server/services/store-context.service';

export type CustomerClassification = CustomerRelationshipSegment | 'LAPSED' | null;

type CustomerListInput = {
  search?: string;
  page?: number;
  segment?: string;
  sort?: string;
};

async function requireCustomersContext() {
  const context = await requireActiveStoreContext(Permission.VIEW_CUSTOMER_CONTACT);
  if (!isTenantAdmin(context.session.tenantRole)) {
    throw new AuthorizationError('Clientes está disponível para proprietários e gerentes.');
  }
  if (!context.store.entitlement?.consumerIdentityEnabled) throw new NotFoundError('Página');
  return context;
}

type CustomerRow = {
  id: string;
  name: string;
  totalOrders: bigint;
  completedOrders: bigint;
  lastOrderAt: Date | null;
  totalSpent: bigint;
  averageTicket: bigint;
  classification: 'NEW' | 'RECURRING' | 'LAPSED' | null;
  totalRows: bigint;
};

async function listCustomersLegacy(
  context: Awaited<ReturnType<typeof requireCustomersContext>>,
  input: CustomerListInput,
) {
  const page = Math.max(1, input.page ?? 1);
  const search = input.search?.trim().slice(0, 80) ?? '';
  const phoneSearch = normalizePhone(search);
  const rows = await getDb().$queryRaw<CustomerRow[]>(Prisma.sql`
    WITH metrics AS (
      SELECT
        customer."id",
        customer."name",
        customer."phoneNormalized",
        COUNT(order_row."id") FILTER (WHERE order_row."acceptedAt" IS NOT NULL)::bigint AS "totalOrders",
        COUNT(order_row."id") FILTER (WHERE order_row."status" = 'DELIVERED'::"OrderStatus" AND order_row."paymentStatus" = 'PAID'::"PaymentStatus")::bigint AS "completedOrders",
        MAX(COALESCE(order_row."deliveredAt", order_row."statusChangedAt")) FILTER (WHERE order_row."status" = 'DELIVERED'::"OrderStatus" AND order_row."paymentStatus" = 'PAID'::"PaymentStatus") AS "lastOrderAt",
        COALESCE(SUM(order_row."total") FILTER (WHERE order_row."status" = 'DELIVERED'::"OrderStatus" AND order_row."paymentStatus" = 'PAID'::"PaymentStatus"), 0)::bigint AS "totalSpent"
      FROM customers customer
      LEFT JOIN orders order_row
        ON order_row."customerId" = customer."id"
        AND order_row."tenantId" = customer."tenantId"
        AND order_row."storeId" = ${context.store.id}
      WHERE customer."tenantId" = ${context.session.tenantId}
        AND EXISTS (
          SELECT 1 FROM orders store_order
          WHERE store_order."customerId" = customer."id"
            AND store_order."tenantId" = customer."tenantId"
            AND store_order."storeId" = ${context.store.id}
        )
        AND (${search} = '' OR lower(customer."name") LIKE lower(${`${search}%`}) OR (${phoneSearch !== ''} AND customer."phoneNormalized" LIKE ${`${phoneSearch}%`}))
      GROUP BY customer."id"
    )
    SELECT
      metrics.*,
      CASE WHEN metrics."completedOrders" > 0 THEN round(metrics."totalSpent"::numeric / metrics."completedOrders")::bigint ELSE 0::bigint END AS "averageTicket",
      CASE
        WHEN metrics."completedOrders" = 1 THEN 'NEW'
        WHEN metrics."completedOrders" >= 2 AND metrics."lastOrderAt" >= CURRENT_TIMESTAMP - INTERVAL '60 days' THEN 'RECURRING'
        WHEN metrics."completedOrders" >= 2 THEN 'LAPSED'
        ELSE NULL
      END AS classification,
      COUNT(*) OVER()::bigint AS "totalRows"
    FROM metrics
    ORDER BY metrics."lastOrderAt" DESC NULLS LAST, metrics."name" ASC, metrics."id" ASC
    LIMIT 25 OFFSET ${(page - 1) * 25}
  `);
  const summaryRows = await getDb().$queryRaw<
    Array<{ total: bigint; recurring: bigint; lapsed: bigint; returnedThisMonth: bigint }>
  >(Prisma.sql`
    WITH completed AS (
      SELECT customer."id", COUNT(order_row."id")::bigint AS count,
        MAX(COALESCE(order_row."deliveredAt", order_row."statusChangedAt")) AS "lastOrderAt"
      FROM customers customer
      LEFT JOIN orders order_row ON order_row."customerId" = customer."id"
        AND order_row."tenantId" = customer."tenantId" AND order_row."storeId" = ${context.store.id}
        AND order_row."status" = 'DELIVERED'::"OrderStatus" AND order_row."paymentStatus" = 'PAID'::"PaymentStatus"
      WHERE customer."tenantId" = ${context.session.tenantId}
        AND EXISTS (
          SELECT 1 FROM orders store_order
          WHERE store_order."customerId" = customer."id"
            AND store_order."tenantId" = customer."tenantId"
            AND store_order."storeId" = ${context.store.id}
        )
      GROUP BY customer."id"
    ), returned AS (
      SELECT DISTINCT recent."customerId"
      FROM orders recent
      WHERE recent."tenantId" = ${context.session.tenantId}
        AND recent."storeId" = ${context.store.id}
        AND recent.status = 'DELIVERED'::"OrderStatus"
        AND recent."paymentStatus" = 'PAID'::"PaymentStatus"
        AND COALESCE(recent."deliveredAt", recent."statusChangedAt") >=
          (date_trunc('month', CURRENT_TIMESTAMP AT TIME ZONE ${context.store.timeZone}) AT TIME ZONE ${context.store.timeZone})
        AND EXISTS (
          SELECT 1 FROM orders previous
          WHERE previous."tenantId" = recent."tenantId"
            AND previous."storeId" = recent."storeId"
            AND previous."customerId" = recent."customerId"
            AND previous.status = 'DELIVERED'::"OrderStatus"
            AND previous."paymentStatus" = 'PAID'::"PaymentStatus"
            AND COALESCE(previous."deliveredAt", previous."statusChangedAt") <
              (date_trunc('month', CURRENT_TIMESTAMP AT TIME ZONE ${context.store.timeZone}) AT TIME ZONE ${context.store.timeZone})
        )
    ) SELECT COUNT(*)::bigint AS total,
      COUNT(*) FILTER (WHERE count >= 2 AND "lastOrderAt" >= CURRENT_TIMESTAMP - INTERVAL '60 days')::bigint AS recurring,
      COUNT(*) FILTER (WHERE count >= 2 AND "lastOrderAt" < CURRENT_TIMESTAMP - INTERVAL '60 days')::bigint AS lapsed,
      (SELECT COUNT(*)::bigint FROM returned) AS "returnedThisMonth"
    FROM completed
  `);
  return {
    store: { id: context.store.id, name: context.store.name },
    items: rows.map((row) => ({
      id: row.id,
      name: row.name,
      totalOrders: Number(row.totalOrders),
      completedOrders: Number(row.completedOrders),
      lastOrderAt: row.lastOrderAt,
      totalSpent: Number(row.totalSpent),
      averageTicket: Number(row.averageTicket),
      classification: row.classification as CustomerClassification,
      averageDaysBetweenOrders: null,
      lastOrderDaysAgo: row.lastOrderAt ? relationshipDaysSince(row.lastOrderAt) : null,
    })),
    total: Number(rows[0]?.totalRows ?? 0),
    page,
    summary: {
      total: Number(summaryRows[0]?.total ?? 0),
      recurring: Number(summaryRows[0]?.recurring ?? 0),
      lapsed: Number(summaryRows[0]?.lapsed ?? 0),
      returnedThisMonth: Number(summaryRows[0]?.returnedThisMonth ?? 0),
      new: 0,
      frequent: 0,
      cooling: 0,
      inactive: 0,
      recovered: 0,
    },
    v2Enabled: Boolean(context.store.entitlement?.consumerConvenienceV2Enabled),
    relationshipEnabled: false,
    loyaltyEnabled: Boolean(context.store.entitlement?.loyaltyEnabled),
    segment: 'ALL' as const,
    sort: 'RECENT' as const,
  };
}

async function listCustomersRelationship(
  context: Awaited<ReturnType<typeof requireCustomersContext>>,
  input: CustomerListInput,
) {
  const page = Math.max(1, input.page ?? 1);
  const search = input.search?.trim().slice(0, 80) ?? '';
  const phoneSearch = normalizePhone(search);
  const parsedSegment = customerRelationshipFilterSchema.safeParse(input.segment);
  const parsedSort = customerRelationshipSortSchema.safeParse(input.sort);
  const segment = parsedSegment.success ? parsedSegment.data : 'ALL';
  const sort = parsedSort.success ? parsedSort.data : 'RECENT';
  const tenantId = context.session.tenantId;
  const storeId = context.store.id;
  await refreshCustomerRelationshipSegments({ tenantId, storeId });
  const where: Prisma.CustomerRelationshipSnapshotWhereInput = {
    tenantId,
    storeId,
    ...(segment === 'ALL' ? {} : { segment }),
    ...(search
      ? {
          customer: {
            OR: [
              { name: { startsWith: search, mode: 'insensitive' as const } },
              ...(phoneSearch ? [{ phoneNormalized: { startsWith: phoneSearch } }] : []),
            ],
          },
        }
      : {}),
  };
  const orderBy: Prisma.CustomerRelationshipSnapshotOrderByWithRelationInput[] =
    sort === 'FREQUENT'
      ? [{ completedOrderCount: 'desc' }, { lastCompletedOrderAt: 'desc' }, { id: 'asc' }]
      : sort === 'ATTENTION'
        ? [{ lastCompletedOrderAt: 'asc' }, { id: 'asc' }]
        : [{ lastCompletedOrderAt: 'desc' }, { id: 'asc' }];
  const [snapshots, total, groups] = await Promise.all([
    getDb().customerRelationshipSnapshot.findMany({
      where,
      orderBy,
      skip: (page - 1) * 25,
      take: 25,
      select: {
        completedOrderCount: true,
        totalCompletedOrderValue: true,
        averageOrderValue: true,
        averageDaysBetweenOrders: true,
        lastCompletedOrderAt: true,
        segment: true,
        customer: { select: { id: true, name: true } },
      },
    }),
    getDb().customerRelationshipSnapshot.count({ where }),
    getDb().customerRelationshipSnapshot.groupBy({
      by: ['segment'],
      where: { tenantId, storeId },
      _count: { _all: true },
    }),
  ]);
  const counts = Object.fromEntries(
    groups.map((group) => [group.segment, group._count._all]),
  ) as Partial<Record<CustomerRelationshipSegment, number>>;
  return {
    store: { id: storeId, name: context.store.name },
    items: snapshots.map((snapshot) => ({
      id: snapshot.customer.id,
      name: snapshot.customer.name,
      totalOrders: snapshot.completedOrderCount,
      completedOrders: snapshot.completedOrderCount,
      lastOrderAt: snapshot.lastCompletedOrderAt,
      totalSpent: snapshot.totalCompletedOrderValue,
      averageTicket: snapshot.averageOrderValue,
      classification: snapshot.segment as CustomerClassification,
      averageDaysBetweenOrders: snapshot.averageDaysBetweenOrders,
      lastOrderDaysAgo: relationshipDaysSince(snapshot.lastCompletedOrderAt),
    })),
    total,
    page,
    summary: {
      total: groups.reduce((sum, group) => sum + group._count._all, 0),
      recurring: (counts.RETURNING ?? 0) + (counts.RECURRING ?? 0) + (counts.FREQUENT ?? 0),
      lapsed: (counts.COOLING ?? 0) + (counts.INACTIVE ?? 0),
      returnedThisMonth: counts.RECOVERED ?? 0,
      new: counts.NEW ?? 0,
      frequent: counts.FREQUENT ?? 0,
      cooling: counts.COOLING ?? 0,
      inactive: counts.INACTIVE ?? 0,
      recovered: counts.RECOVERED ?? 0,
    },
    v2Enabled: Boolean(context.store.entitlement?.consumerConvenienceV2Enabled),
    relationshipEnabled: true,
    loyaltyEnabled: Boolean(context.store.entitlement?.loyaltyEnabled),
    segment,
    sort,
  };
}

export async function listCustomersV1(input: CustomerListInput = {}) {
  const context = await requireCustomersContext();
  return context.store.entitlement?.customerRelationshipEnabled
    ? listCustomersRelationship(context, input)
    : listCustomersLegacy(context, input);
}

export async function getCustomerProfileV1(customerId: string) {
  const context = await requireCustomersContext();
  const customer = await getDb().customer.findFirst({
    where: {
      id: customerId,
      tenantId: context.session.tenantId,
      orders: { some: { tenantId: context.session.tenantId, storeId: context.store.id } },
    },
    select: { id: true, name: true, phone: true, phoneNormalized: true, consumerIdentityId: true },
  });
  if (!customer) throw new NotFoundError('Cliente');
  const result = await listCustomersV1({ search: customer.phoneNormalized, page: 1 });
  const metrics = result.items.find((item) => item.id === customer.id);
  const orders = await getDb().order.findMany({
    where: {
      tenantId: context.session.tenantId,
      storeId: context.store.id,
      customerId: customer.id,
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 10,
    select: {
      id: true,
      orderNumber: true,
      status: true,
      paymentStatus: true,
      total: true,
      createdAt: true,
    },
  });
  let mostOrdered: { productName: string; orderCount: number } | null = null;
  let repurchase: Awaited<ReturnType<typeof getCustomerRepurchaseShortcuts>> | null = null;
  if (context.store.entitlement?.consumerConvenienceV2Enabled) {
    const [mostOrderedRows, shortcuts] = await Promise.all([
      getDb().$queryRaw<Array<{ productName: string; orderCount: bigint }>>(Prisma.sql`
        SELECT item."productName", COUNT(DISTINCT item."orderId")::bigint AS "orderCount"
        FROM order_items item
        INNER JOIN orders order_row ON order_row.id = item."orderId"
          AND order_row."tenantId" = item."tenantId" AND order_row."storeId" = item."storeId"
        WHERE order_row."tenantId" = ${context.session.tenantId}
          AND order_row."storeId" = ${context.store.id}
          AND order_row."customerId" = ${customer.id}
          AND order_row.status = 'DELIVERED'::"OrderStatus"
          AND order_row."paymentStatus" = 'PAID'::"PaymentStatus"
        GROUP BY item."productId", item."productName"
        ORDER BY "orderCount" DESC, item."productName" ASC, item."productId" ASC
        LIMIT 1
      `),
      getCustomerRepurchaseShortcuts({
        tenantId: context.session.tenantId,
        storeId: context.store.id,
        customerId: customer.id,
      }),
    ]);
    const row = mostOrderedRows[0];
    if (row) mostOrdered = { productName: row.productName, orderCount: Number(row.orderCount) };
    repurchase = shortcuts;
  }
  const loyalty = context.store.entitlement?.loyaltyEnabled
    ? await getCustomerLoyaltySummary({
        tenantId: context.session.tenantId,
        storeId: context.store.id,
        consumerIdentityId: customer.consumerIdentityId,
      })
    : null;
  const relationship =
    context.store.entitlement?.customerRelationshipEnabled && customer.consumerIdentityId
      ? await getDb().customerRelationshipSnapshot.findFirst({
          where: {
            tenantId: context.session.tenantId,
            storeId: context.store.id,
            customerId: customer.id,
            consumerIdentityId: customer.consumerIdentityId,
          },
        })
      : null;
  return {
    customer,
    metrics: metrics ?? null,
    orders,
    mostOrdered,
    repurchase,
    loyalty,
    relationship: relationship
      ? {
          ...relationship,
          lastOrderDaysAgo: relationshipDaysSince(relationship.lastCompletedOrderAt),
          thresholds: getCustomerRelationshipThresholds({
            completedOrderCount: relationship.completedOrderCount,
            averageDaysBetweenOrders: relationship.averageDaysBetweenOrders,
          }),
        }
      : null,
    relationshipEnabled: Boolean(context.store.entitlement?.customerRelationshipEnabled),
  };
}

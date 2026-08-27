import 'server-only';

import { Prisma } from '@prisma/client';

import { normalizePhone } from '@/lib/brazil';
import { getDb } from '@/server/database/client';
import { AuthorizationError, NotFoundError } from '@/server/errors';
import { isTenantAdmin, Permission } from '@/server/permissions';
import { requireActiveStoreContext } from '@/server/services/store-context.service';
import { getCustomerRepurchaseShortcuts } from '@/server/services/consumer-repurchase.service';
import { getCustomerLoyaltySummary } from '@/server/services/loyalty.service';

export type CustomerClassification = 'NEW' | 'RECURRING' | 'LAPSED' | null;

async function requireCustomersContext() {
  const context = await requireActiveStoreContext(Permission.VIEW_CUSTOMER_CONTACT);
  if (!isTenantAdmin(context.session.tenantRole))
    throw new AuthorizationError('Clientes está disponível para proprietários e gerentes.');
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
  classification: CustomerClassification;
  totalRows: bigint;
};

export async function listCustomersV1(input: { search?: string; page?: number } = {}) {
  const context = await requireCustomersContext();
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
      ...row,
      totalOrders: Number(row.totalOrders),
      completedOrders: Number(row.completedOrders),
      totalSpent: Number(row.totalSpent),
      averageTicket: Number(row.averageTicket),
      totalRows: undefined,
    })),
    total: Number(rows[0]?.totalRows ?? 0),
    page,
    summary: {
      total: Number(summaryRows[0]?.total ?? 0),
      recurring: Number(summaryRows[0]?.recurring ?? 0),
      lapsed: Number(summaryRows[0]?.lapsed ?? 0),
      returnedThisMonth: Number(summaryRows[0]?.returnedThisMonth ?? 0),
    },
    v2Enabled: Boolean(context.store.entitlement?.consumerConvenienceV2Enabled),
  };
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
  return { customer, metrics: metrics ?? null, orders, mostOrdered, repurchase, loyalty };
}

import 'server-only';

import { Prisma } from '@prisma/client';

import { normalizePhone } from '@/lib/brazil';
import { getDb } from '@/server/database/client';
import { AuthorizationError, NotFoundError } from '@/server/errors';
import { isTenantAdmin, Permission } from '@/server/permissions';
import { requireActiveStoreContext } from '@/server/services/store-context.service';

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
    Array<{ total: bigint; recurring: bigint; lapsed: bigint }>
  >(Prisma.sql`
    WITH completed AS (
      SELECT customer."id", COUNT(order_row."id")::bigint AS count,
        MAX(COALESCE(order_row."deliveredAt", order_row."statusChangedAt")) AS "lastOrderAt"
      FROM customers customer
      LEFT JOIN orders order_row ON order_row."customerId" = customer."id"
        AND order_row."tenantId" = customer."tenantId" AND order_row."storeId" = ${context.store.id}
        AND order_row."status" = 'DELIVERED'::"OrderStatus" AND order_row."paymentStatus" = 'PAID'::"PaymentStatus"
      WHERE customer."tenantId" = ${context.session.tenantId}
      GROUP BY customer."id"
    ) SELECT COUNT(*)::bigint AS total,
      COUNT(*) FILTER (WHERE count >= 2 AND "lastOrderAt" >= CURRENT_TIMESTAMP - INTERVAL '60 days')::bigint AS recurring,
      COUNT(*) FILTER (WHERE count >= 2 AND "lastOrderAt" < CURRENT_TIMESTAMP - INTERVAL '60 days')::bigint AS lapsed
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
    },
  };
}

export async function getCustomerProfileV1(customerId: string) {
  const context = await requireCustomersContext();
  const customer = await getDb().customer.findFirst({
    where: { id: customerId, tenantId: context.session.tenantId },
    select: { id: true, name: true, phone: true, phoneNormalized: true },
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
  return { customer, metrics: metrics ?? null, orders };
}

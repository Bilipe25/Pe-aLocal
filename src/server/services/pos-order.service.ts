import 'server-only';

import { Prisma } from '@prisma/client';

import { storeAssetUrl } from '@/features/assets/urls';
import { normalizePhone } from '@/lib/brazil';
import { buildOrderCompositionSignature } from '@/server/services/consumer-repurchase.service';
import type { PosOrderInput, PosQuoteInput } from '@/schemas/pos';
import { getDb } from '@/server/database/client';
import { AuthorizationError, BusinessRuleError, CheckoutError } from '@/server/errors';
import { hasTenantPermission, Permission } from '@/server/permissions';
import { createOrder } from '@/server/repositories/order.repository';
import { getPublicDeliveryZones, getPublicOffers } from '@/server/queries/public-store';
import {
  calculateCheckoutQuote,
  applyAuthorizedPosManualDiscount,
  toPublicCheckoutQuote,
  type ResolvedSavedCheckoutAddress,
} from '@/server/services/checkout-quote.service';
import { getEffectiveStoreAvailabilityForTenant } from '@/server/services/store-availability.service';
import { requirePosContext, type PosContext } from '@/server/services/pos-context.service';
import { rebuildPosOrderInputFromDraft } from '@/server/services/pos-draft.service';
import { getPosOperationalOverview } from '@/server/services/pos-operations.service';

async function resolveQuoteAddress(context: PosContext, input: PosQuoteInput) {
  const addressId = input.deliveryAddress?.customerAddressId;
  if (!addressId) return null;
  if (!input.customerId) {
    throw new CheckoutError(
      'CART_INVALID',
      'Selecione o cliente vinculado ao endereço salvo.',
      422,
    );
  }
  const address = await getDb().customerAddress.findFirst({
    where: {
      id: addressId,
      tenantId: context.session.tenantId,
      ...(input.customerId ? { customerId: input.customerId } : {}),
    },
    select: {
      id: true,
      addressFingerprint: true,
      updatedAt: true,
      street: true,
      number: true,
      complement: true,
      neighborhood: true,
      city: true,
      state: true,
      zipCode: true,
      reference: true,
      storeUses: {
        where: { storeId: context.store.id },
        take: 1,
        select: { deliveryZoneId: true },
      },
    },
  });
  if (!address) throw new CheckoutError('CART_INVALID', 'O endereço selecionado não existe.', 422);
  return {
    id: address.id,
    addressFingerprint: address.addressFingerprint,
    updatedAt: address.updatedAt,
    street: address.street,
    number: address.number,
    complement: address.complement,
    neighborhood: address.neighborhood,
    city: address.city,
    state: address.state,
    zipCode: address.zipCode,
    reference: address.reference,
    mappedDeliveryZoneId:
      address.storeUses[0]?.deliveryZoneId ?? input.deliveryAddress?.deliveryZoneId ?? null,
  } satisfies ResolvedSavedCheckoutAddress;
}

async function resolveQuoteTable(context: PosContext, input: PosQuoteInput) {
  if (input.modality !== 'DINE_IN' || !input.diningTableId) return null;
  if (!context.store.entitlement?.dineInQrEnabled) {
    throw new BusinessRuleError(
      'A modalidade Mesa exige que o recurso de salão esteja habilitado.',
    );
  }
  const table = await getDb().storeDiningTable.findFirst({
    where: {
      id: input.diningTableId,
      tenantId: context.session.tenantId,
      storeId: context.store.id,
    },
    select: { id: true, tenantId: true, storeId: true, label: true, version: true, isActive: true },
  });
  if (!table?.isActive) throw new BusinessRuleError('A mesa selecionada não está ativa.');
  return table;
}

export async function calculatePosQuote(input: PosQuoteInput) {
  const context = await requirePosContext();
  if (
    input.manualDiscount &&
    !hasTenantPermission(context.session.tenantRole, Permission.APPLY_POS_MANUAL_DISCOUNT)
  ) {
    throw new AuthorizationError('Seu perfil não pode aplicar desconto manual.');
  }
  const [savedAddress, diningTable, availability] = await Promise.all([
    resolveQuoteAddress(context, input),
    resolveQuoteTable(context, input),
    getEffectiveStoreAvailabilityForTenant(context.session.tenantId, context.store.id),
  ]);
  const quoteInput =
    input.modality === 'DINE_IN'
      ? { modality: 'DINE_IN' as const, items: input.items, couponCode: input.couponCode }
      : {
          modality: input.modality,
          items: input.items,
          couponCode: input.couponCode,
          deliveryZoneId: input.deliveryAddress?.deliveryZoneId,
          deliveryPostalCode: input.deliveryAddress?.postalCode,
          deliveryAddress: input.deliveryAddress
            ? {
                postalCode: input.deliveryAddress.postalCode,
                street: input.deliveryAddress.street,
                number: input.deliveryAddress.number,
                complement: input.deliveryAddress.complement,
                reference: input.deliveryAddress.reference,
              }
            : undefined,
        };
  const baseQuote = await calculateCheckoutQuote(context.store.slug, quoteInput, {
    channel: 'POS',
    savedAddress,
    diningTable,
  });
  if (!baseQuote) throw new BusinessRuleError('A loja ativa não está disponível.');
  const quote = applyAuthorizedPosManualDiscount(baseQuote, input.manualDiscount);
  return {
    quote: toPublicCheckoutQuote(quote),
    availabilityWarning:
      availability.state === 'CLOSED_BY_SCHEDULE' || availability.state === 'MANUALLY_CLOSED'
        ? availability.reason
        : null,
  };
}

export async function createPosOrder(input: PosOrderInput) {
  const context = await requirePosContext();
  const orderInput = await rebuildPosOrderInputFromDraft(context, input);
  if (
    orderInput.manualDiscount &&
    !hasTenantPermission(context.session.tenantRole, Permission.APPLY_POS_MANUAL_DISCOUNT)
  ) {
    throw new AuthorizationError('Seu perfil não pode aplicar desconto manual.');
  }
  if (
    orderInput.modality === 'DINE_IN' &&
    (!context.store.entitlement?.dineInQrEnabled ||
      !hasTenantPermission(context.session.tenantRole, Permission.OPERATE_DINING_ROOM))
  ) {
    throw new AuthorizationError('Seu perfil não pode criar pedidos para mesas.');
  }
  if (
    orderInput.paidNow &&
    !hasTenantPermission(context.session.tenantRole, Permission.CONFIRM_MANUAL_PAYMENT)
  ) {
    throw new AuthorizationError('Seu perfil não pode confirmar pagamentos manuais.');
  }
  if (
    orderInput.modality === 'DELIVERY' &&
    orderInput.paidNow &&
    orderInput.paymentMethod !== 'PIX'
  ) {
    throw new BusinessRuleError(
      'No Delivery, somente o Pix manual pode ser marcado como pago agora.',
    );
  }

  console.info('[POS_ORDER_CREATE_STARTED]', {
    storeId: context.store.id,
    userId: context.session.userId,
    modality: orderInput.modality,
    itemCount: orderInput.items.length,
  });
  try {
    const result = await createOrder({
      input: orderInput,
      pos: {
        tenantId: context.session.tenantId,
        storeId: context.store.id,
        userId: context.session.userId,
        userName: context.session.name,
        canConfirmPayment: hasTenantPermission(
          context.session.tenantRole,
          Permission.CONFIRM_MANUAL_PAYMENT,
        ),
        canRefundPayment: false,
      },
    });
    console.info('[POS_ORDER_CREATED]', {
      storeId: context.store.id,
      orderId: result.id,
      orderNumber: result.orderNumber,
      created: result.created,
    });
    return result;
  } catch (error) {
    console.error('[POS_ORDER_CREATE_FAILED]', {
      storeId: context.store.id,
      userId: context.session.userId,
      error: error instanceof Error ? error.name : 'unknown',
    });
    throw error;
  }
}

export async function searchPosCustomers(search: string) {
  const context = await requirePosContext();
  if (!hasTenantPermission(context.session.tenantRole, Permission.VIEW_CUSTOMER_CONTACT)) {
    throw new AuthorizationError('Seu perfil não pode consultar dados de clientes.');
  }
  const term = search.trim().slice(0, 80);
  if (term.length < 2)
    throw new BusinessRuleError('Digite ao menos dois caracteres do nome ou telefone.');
  const phoneNormalized = normalizePhone(term);
  const customers = await getDb().$queryRaw<
    Array<{
      id: string;
      name: string;
      phone: string;
      completedOrders: bigint;
      totalSpent: bigint;
      lastOrderAt: Date | null;
      classification: 'NEW' | 'RECURRING' | 'LAPSED' | null;
      mostOrderedProductName: string | null;
      mostOrderedCount: bigint | null;
    }>
  >(Prisma.sql`
    WITH product_counts AS (
      SELECT order_row."customerId", item."productId", item."productName",
        COUNT(DISTINCT order_row.id)::bigint AS "orderCount"
      FROM orders order_row
      INNER JOIN order_items item ON item."orderId" = order_row.id
        AND item."tenantId" = order_row."tenantId" AND item."storeId" = order_row."storeId"
      WHERE order_row."tenantId" = ${context.session.tenantId}
        AND order_row."storeId" = ${context.store.id}
        AND order_row.status = 'DELIVERED'::"OrderStatus"
        AND order_row."paymentStatus" = 'PAID'::"PaymentStatus"
        AND order_row."customerId" IS NOT NULL
      GROUP BY order_row."customerId", item."productId", item."productName"
    ), top_product AS (
      SELECT DISTINCT ON ("customerId") "customerId", "productName", "orderCount"
      FROM product_counts
      ORDER BY "customerId", "orderCount" DESC, "productName" ASC, "productId" ASC
    )
    SELECT customer.id, customer.name, customer.phone,
      COUNT(order_row.id) FILTER (WHERE order_row.status = 'DELIVERED'::"OrderStatus" AND order_row."paymentStatus" = 'PAID'::"PaymentStatus")::bigint AS "completedOrders",
      COALESCE(SUM(order_row.total) FILTER (WHERE order_row.status = 'DELIVERED'::"OrderStatus" AND order_row."paymentStatus" = 'PAID'::"PaymentStatus"), 0)::bigint AS "totalSpent",
      MAX(COALESCE(order_row."deliveredAt", order_row."statusChangedAt")) FILTER (WHERE order_row.status = 'DELIVERED'::"OrderStatus" AND order_row."paymentStatus" = 'PAID'::"PaymentStatus") AS "lastOrderAt",
      CASE
        WHEN COUNT(order_row.id) FILTER (WHERE order_row.status = 'DELIVERED'::"OrderStatus" AND order_row."paymentStatus" = 'PAID'::"PaymentStatus") = 1 THEN 'NEW'
        WHEN COUNT(order_row.id) FILTER (WHERE order_row.status = 'DELIVERED'::"OrderStatus" AND order_row."paymentStatus" = 'PAID'::"PaymentStatus") >= 2 AND MAX(COALESCE(order_row."deliveredAt", order_row."statusChangedAt")) FILTER (WHERE order_row.status = 'DELIVERED'::"OrderStatus" AND order_row."paymentStatus" = 'PAID'::"PaymentStatus") >= CURRENT_TIMESTAMP - INTERVAL '60 days' THEN 'RECURRING'
        WHEN COUNT(order_row.id) FILTER (WHERE order_row.status = 'DELIVERED'::"OrderStatus" AND order_row."paymentStatus" = 'PAID'::"PaymentStatus") >= 2 THEN 'LAPSED'
        ELSE NULL
      END AS classification,
      top_product."productName" AS "mostOrderedProductName",
      top_product."orderCount" AS "mostOrderedCount"
    FROM customers customer
    LEFT JOIN orders order_row ON order_row."customerId" = customer.id AND order_row."tenantId" = customer."tenantId" AND order_row."storeId" = ${context.store.id}
    WHERE customer."tenantId" = ${context.session.tenantId}
      AND EXISTS (
        SELECT 1 FROM orders store_order
        WHERE store_order."customerId" = customer.id
          AND store_order."tenantId" = customer."tenantId"
          AND store_order."storeId" = ${context.store.id}
      )
      AND (lower(customer.name) LIKE lower(${`${term}%`}) OR (${phoneNormalized !== ''} AND customer."phoneNormalized" LIKE ${`${phoneNormalized}%`}))
    LEFT JOIN top_product ON top_product."customerId" = customer.id
    GROUP BY customer.id, top_product."productName", top_product."orderCount"
    ORDER BY "lastOrderAt" DESC NULLS LAST, customer.name ASC
    LIMIT 5
  `);
  if (!customers.length) return [];
  const addresses = await getDb().customerAddress.findMany({
    where: {
      tenantId: context.session.tenantId,
      customerId: { in: customers.map((customer) => customer.id) },
      storeUses: { some: { tenantId: context.session.tenantId, storeId: context.store.id } },
    },
    orderBy: [{ isDefault: 'desc' }, { lastUsedAt: 'desc' }, { updatedAt: 'desc' }],
    select: {
      id: true,
      customerId: true,
      label: true,
      street: true,
      number: true,
      complement: true,
      neighborhood: true,
      city: true,
      state: true,
      zipCode: true,
      reference: true,
      storeUses: {
        where: { storeId: context.store.id },
        take: 1,
        select: { deliveryZoneId: true },
      },
    },
  });
  const usualByCustomer = new Map<
    string,
    { orderId: string; occurrences: number; summary: string }
  >();
  if (context.store.entitlement?.consumerConvenienceV2Enabled) {
    const since = new Date();
    since.setUTCMonth(since.getUTCMonth() - 12);
    const historicOrders = await getDb().order.findMany({
      where: {
        tenantId: context.session.tenantId,
        storeId: context.store.id,
        customerId: { in: customers.map((customer) => customer.id) },
        status: 'DELIVERED',
        paymentStatus: 'PAID',
        createdAt: { gte: since },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 250,
      select: {
        id: true,
        customerId: true,
        createdAt: true,
        orderNumber: true,
        items: {
          orderBy: [{ position: 'asc' }, { id: 'asc' }],
          select: {
            productId: true,
            productName: true,
            quantity: true,
            offerGroupId: true,
            options: { select: { optionId: true } },
          },
        },
      },
    });
    for (const customer of customers) {
      const groups = new Map<string, { count: number; order: (typeof historicOrders)[number] }>();
      for (const order of historicOrders
        .filter((candidate) => candidate.customerId === customer.id)
        .slice(0, 50)) {
        const signature = buildOrderCompositionSignature(order);
        if (!signature) continue;
        const current = groups.get(signature);
        if (current) current.count += 1;
        else groups.set(signature, { count: 1, order });
      }
      const usual = [...groups.values()].sort(
        (left, right) =>
          right.count - left.count ||
          right.order.createdAt.getTime() - left.order.createdAt.getTime(),
      )[0];
      if (usual && usual.count >= 3) {
        usualByCustomer.set(customer.id, {
          orderId: usual.order.id,
          occurrences: usual.count,
          summary: usual.order.items
            .slice(0, 3)
            .map((item) => `${item.quantity}× ${item.productName}`)
            .join(' + '),
        });
      }
    }
  }
  return customers.map((customer) => ({
    ...customer,
    completedOrders: Number(customer.completedOrders),
    totalSpent: Number(customer.totalSpent),
    mostOrderedCount: Number(customer.mostOrderedCount ?? 0),
    v2Enabled: Boolean(context.store.entitlement?.consumerConvenienceV2Enabled),
    usualOrder: usualByCustomer.get(customer.id) ?? null,
    addresses: addresses
      .filter((address) => address.customerId === customer.id)
      .slice(0, 5)
      .map(({ storeUses, ...address }) => ({
        ...address,
        deliveryZoneId: storeUses[0]?.deliveryZoneId ?? null,
      })),
  }));
}

export async function getPosWorkspace() {
  const context = await requirePosContext();
  const [categories, products, offers, deliveryZones, tables, settings, availability, operations] =
    await Promise.all([
      getDb().category.findMany({
        where: {
          tenantId: context.session.tenantId,
          storeId: context.store.id,
          isActive: true,
          archivedAt: null,
        },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: { id: true, name: true },
      }),
      getDb().product.findMany({
        where: {
          tenantId: context.session.tenantId,
          storeId: context.store.id,
          archivedAt: null,
        },
        orderBy: [{ category: { sortOrder: 'asc' } }, { sortOrder: 'asc' }, { name: 'asc' }],
        select: {
          id: true,
          categoryId: true,
          name: true,
          description: true,
          basePrice: true,
          imageUrl: true,
          imageAssetId: true,
          isAvailable: true,
          isSoldOut: true,
          allowNotes: true,
          optionGroups: {
            where: { isActive: true, archivedAt: null },
            orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
            select: {
              id: true,
              title: true,
              description: true,
              isRequired: true,
              isMultiple: true,
              minSelections: true,
              maxSelections: true,
              options: {
                where: { isAvailable: true, archivedAt: null },
                orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
                select: { id: true, name: true, price: true },
              },
            },
          },
        },
      }),
      getPublicOffers(context.store.id, context.session.tenantId, context.store.timeZone),
      getPublicDeliveryZones(context.store.id),
      context.store.entitlement?.dineInQrEnabled
        ? getDb().storeDiningTable.findMany({
            where: {
              tenantId: context.session.tenantId,
              storeId: context.store.id,
              isActive: true,
            },
            orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
            select: {
              id: true,
              label: true,
              sessions: {
                where: { status: 'OPEN' },
                take: 1,
                select: { id: true, openedAt: true },
              },
            },
          })
        : Promise.resolve([]),
      getDb().storeSettings.findUnique({
        where: { storeId: context.store.id },
        select: {
          deliveryEnabled: true,
          pickupEnabled: true,
          acceptsPix: true,
          pixKey: true,
          pixKeyType: true,
          acceptsCash: true,
          acceptsCardOnDelivery: true,
          acceptsCardInPerson: true,
        },
      }),
      getEffectiveStoreAvailabilityForTenant(context.session.tenantId, context.store.id),
      getPosOperationalOverview(context),
    ]);

  return {
    store: { id: context.store.id, name: context.store.name, slug: context.store.slug },
    capabilities: {
      canLookupCustomer: hasTenantPermission(
        context.session.tenantRole,
        Permission.VIEW_CUSTOMER_CONTACT,
      ),
      canConfirmPayment: hasTenantPermission(
        context.session.tenantRole,
        Permission.CONFIRM_MANUAL_PAYMENT,
      ),
      canUseDiningRoom: Boolean(
        context.store.entitlement?.dineInQrEnabled &&
        hasTenantPermission(context.session.tenantRole, Permission.OPERATE_DINING_ROOM),
      ),
      canManagePosShortcuts: hasTenantPermission(
        context.session.tenantRole,
        Permission.MANAGE_POS_SHORTCUTS,
      ),
      canManagePosTerminals: hasTenantPermission(
        context.session.tenantRole,
        Permission.MANAGE_POS_TERMINALS,
      ),
      canApplyManualDiscount: hasTenantPermission(
        context.session.tenantRole,
        Permission.APPLY_POS_MANUAL_DISCOUNT,
      ),
    },
    availability: {
      state: availability.state,
      reason: availability.reason,
      blocksPos:
        !availability.acceptingOrders &&
        availability.state !== 'CLOSED_BY_SCHEDULE' &&
        availability.state !== 'MANUALLY_CLOSED',
    },
    categories,
    products: products.map((product) => ({
      ...product,
      imageUrl: product.imageAssetId ? storeAssetUrl(product.imageAssetId, 384) : product.imageUrl,
    })),
    offers,
    deliveryZones,
    tables: tables.map((table) => ({
      id: table.id,
      label: table.label,
      session: table.sessions[0] ?? null,
    })),
    settings,
    operations,
  };
}

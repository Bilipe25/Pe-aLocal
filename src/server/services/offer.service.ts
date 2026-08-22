import { Prisma } from '@prisma/client';

import { isOfferScheduleActive, offerSchedulesOverlap } from '@/domain/offers/schedule';
import { MoneyArithmeticError, multiplyCents, sumCents } from '@/domain/money';
import {
  canonicalOfferAdminInputSchema,
  comboAdminInputSchema,
  offerIdSchema,
  offerListQuerySchema,
  offerVersionSchema,
  productPromotionAdminInputSchema,
  type ComboAdminInput,
  type CanonicalOfferAdminInput,
  type ParsedComboAdminInput,
  type ParsedCanonicalOfferAdminInput,
  type ParsedProductPromotionAdminInput,
  type ProductPromotionAdminInput,
} from '@/schemas/offers';
import { getDb } from '@/server/database/client';
import {
  BusinessRuleError,
  ConcurrencyError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from '@/server/errors';
import { Permission } from '@/server/permissions';
import { createAuditLog } from '@/server/repositories/audit-log.repository';
import * as offerRepo from '@/server/repositories/offer.repository';
import { requireActiveStoreContext } from '@/server/services/store-context.service';

function issues(error: { issues: Array<{ path: PropertyKey[]; message: string }> }) {
  return error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }));
}

function parseId(rawId: unknown) {
  const parsed = offerIdSchema.safeParse(rawId);
  if (!parsed.success)
    throw new ValidationError('A oferta informada é inválida.', issues(parsed.error));
  return parsed.data;
}

function parseVersion(rawVersion: unknown) {
  const parsed = offerVersionSchema.safeParse(rawVersion);
  if (!parsed.success)
    throw new ValidationError('A versão da oferta é inválida.', issues(parsed.error));
  return parsed.data;
}

function parseCombo(rawInput: ComboAdminInput) {
  const parsed = comboAdminInputSchema.safeParse(rawInput);
  if (!parsed.success) throw new ValidationError('Revise os dados do combo.', issues(parsed.error));
  return parsed.data;
}

function parsePromotion(rawInput: ProductPromotionAdminInput) {
  const parsed = productPromotionAdminInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError('Revise os dados da promoção.', issues(parsed.error));
  }
  return parsed.data;
}

function parseCanonicalOffer(rawInput: CanonicalOfferAdminInput) {
  const parsed = canonicalOfferAdminInputSchema.safeParse(rawInput);
  if (!parsed.success)
    throw new ValidationError('Revise os dados da oferta.', issues(parsed.error));
  return parsed.data;
}

function assertEntitled(entitlement: { combosPromotionsEnabled: boolean } | null) {
  if (!entitlement?.combosPromotionsEnabled) {
    throw new BusinessRuleError('Combos e promoções não estão habilitados para esta loja.');
  }
}

function isSerializableConflict(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2034';
}

async function serializableTransaction<T>(
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await getDb().$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (!isSerializableConflict(error) || attempt === 3) throw error;
    }
  }
  throw new Error('Unreachable serializable transaction state.');
}

function dateValue(value: string | null): Date | null {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

function scheduleWriteData(
  input: Pick<
    ParsedComboAdminInput,
    'startsOn' | 'endsOnExclusive' | 'weekdays' | 'startTime' | 'endTimeExclusive'
  >,
) {
  return {
    startsOn: dateValue(input.startsOn),
    endsOnExclusive: dateValue(input.endsOnExclusive),
    weekdays: input.weekdays,
    startMinute: input.startTime,
    endMinuteExclusive: input.endTimeExclusive,
  };
}

function canonicalScheduleWriteData(
  input: Pick<
    ParsedComboAdminInput,
    'startsOn' | 'endsOnExclusive' | 'weekdays' | 'startTime' | 'endTimeExclusive'
  >,
) {
  return scheduleWriteData(input);
}

function canonicalComboGroups(
  items: Array<{
    id: string;
    productId: string;
    quantity: number;
    position: number;
    product: { name: string };
  }>,
) {
  return items.map((item) => ({
    id: item.id,
    name: item.product.name.slice(0, 80),
    quantity: item.quantity,
    position: item.position,
    choices: {
      create: {
        productId: item.productId,
        priceDelta: 0,
        position: 0,
      },
    },
  }));
}

async function validateComboProducts(
  tx: Prisma.TransactionClient,
  tenantId: string,
  storeId: string,
  input: ParsedComboAdminInput,
) {
  const products = await offerRepo.findScopedProducts(
    tx,
    tenantId,
    storeId,
    input.items.map((item) => item.productId),
  );
  if (products.length !== input.items.length || products.some((product) => product.archivedAt)) {
    throw new BusinessRuleError('Um ou mais produtos do combo não estão disponíveis no catálogo.');
  }
  const byId = new Map(products.map((product) => [product.id, product]));
  let regularBaseAmount: number;
  try {
    regularBaseAmount = sumCents(
      input.items.map((item) => multiplyCents(byId.get(item.productId)!.basePrice, item.quantity)),
    );
  } catch (error) {
    if (!(error instanceof MoneyArithmeticError)) throw error;
    throw new BusinessRuleError('A composição do combo excede o valor máximo permitido.');
  }
  if (input.specialPrice >= regularBaseAmount) {
    throw new BusinessRuleError('O preço especial deve ser menor que a soma dos produtos.', [
      { path: 'specialPrice', regularBaseAmount },
    ]);
  }
  return { products, regularBaseAmount };
}

async function validatePromotionProduct(
  tx: Prisma.TransactionClient,
  tenantId: string,
  storeId: string,
  input: ParsedProductPromotionAdminInput,
) {
  const [product] = await offerRepo.findScopedProducts(tx, tenantId, storeId, [input.productId]);
  if (!product || product.archivedAt) {
    throw new BusinessRuleError('O produto selecionado não está disponível no catálogo.');
  }
  if (input.promotionalPrice >= product.basePrice) {
    throw new BusinessRuleError(
      'O preço promocional deve ser menor que o preço atual do produto.',
      [{ path: 'promotionalPrice', basePrice: product.basePrice }],
    );
  }
  return product;
}

function promotionSchedule(input: ParsedProductPromotionAdminInput) {
  return {
    startsOn: input.startsOn,
    endsOnExclusive: input.endsOnExclusive,
    weekdays: input.weekdays,
    startMinute: input.startTime,
    endMinuteExclusive: input.endTimeExclusive,
  };
}

async function assertPromotionWindowAvailable(
  tx: Prisma.TransactionClient,
  tenantId: string,
  storeId: string,
  input: ParsedProductPromotionAdminInput,
  excludeId?: string,
) {
  if (!input.isActive) return;
  await offerRepo.lockPromotionProduct(tx, storeId, input.productId);
  const candidates = await offerRepo.listConflictingPromotionSchedules(
    tx,
    tenantId,
    storeId,
    input.productId,
    excludeId,
  );
  const conflict = candidates.find((candidate) =>
    offerSchedulesOverlap(promotionSchedule(input), candidate),
  );
  if (conflict) {
    throw new ConflictError(`A agenda se sobrepõe a outra promoção de ${conflict.product.name}.`);
  }
}

function statusWhere(status: 'ALL' | 'ACTIVE' | 'PAUSED' | 'ARCHIVED') {
  if (status === 'ARCHIVED') return { archivedAt: { not: null } };
  if (status === 'PAUSED') return { archivedAt: null, isActive: false };
  if (status === 'ACTIVE') return { archivedAt: null, isActive: true };
  return {};
}

export async function listOffersForActiveStore(rawQuery: Record<string, unknown> = {}) {
  const { session, store } = await requireActiveStoreContext(Permission.VIEW_OFFERS);
  assertEntitled(store.entitlement);
  const parsed = offerListQuerySchema.safeParse(rawQuery);
  if (!parsed.success)
    throw new ValidationError('Os filtros informados são inválidos.', issues(parsed.error));

  const pageSize = 25;
  const kindWhere: Prisma.StoreOfferWhereInput =
    parsed.data.kind === 'COMBO'
      ? { kind: { in: ['COMBO_FIXED', 'COMBO_FLEXIBLE'] } }
      : parsed.data.kind === 'PRODUCT_PROMOTION'
        ? { kind: { notIn: ['COMBO_FIXED', 'COMBO_FLEXIBLE'] } }
        : {};
  const where: Prisma.StoreOfferWhereInput = {
    tenantId: session.tenantId,
    storeId: store.id,
    ...kindWhere,
    ...statusWhere(parsed.data.status),
  };
  const [records, total] = await Promise.all([
    getDb().storeOffer.findMany({
      where,
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      skip: (parsed.data.page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        kind: true,
        name: true,
        isActive: true,
        version: true,
        modalities: true,
        startsOn: true,
        endsOnExclusive: true,
        weekdays: true,
        startMinute: true,
        endMinuteExclusive: true,
        archivedAt: true,
        updatedAt: true,
        combo: { select: { fixedPrice: true, groups: { select: { quantity: true } } } },
        productPrice: { select: { fixedPrice: true } },
        quantityPrice: { select: { requiredQuantity: true, groupFixedPrice: true } },
        bogo: { select: { buyQuantity: true, getQuantity: true } },
        cartDiscount: { select: { value: true, minSubtotal: true } },
        freeDelivery: { select: { minSubtotal: true } },
      },
    }),
    getDb().storeOffer.count({ where }),
  ]);
  const offers = records.map((offer) => ({ kind: 'CANONICAL' as const, offer }));

  return {
    session,
    store,
    offers,
    total,
    page: parsed.data.page,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    referenceTime: new Date(),
    isActiveNow: (offer: (typeof offers)[number]) =>
      offer.offer.archivedAt == null &&
      offer.offer.isActive &&
      isOfferScheduleActive(offer.offer, store.timeZone),
  };
}

export async function getOfferEditorProducts() {
  const { session, store } = await requireActiveStoreContext(Permission.MANAGE_OFFERS);
  assertEntitled(store.entitlement);
  const products = await getDb().product.findMany({
    where: { tenantId: session.tenantId, storeId: store.id, archivedAt: null },
    orderBy: [{ category: { sortOrder: 'asc' } }, { sortOrder: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      name: true,
      basePrice: true,
      isAvailable: true,
      isSoldOut: true,
      category: { select: { name: true } },
    },
  });
  return { store, products };
}

export async function getOfferPerformanceAndOpportunities(rawPeriod: unknown = 30) {
  const { session, store } = await requireActiveStoreContext(Permission.VIEW_OFFERS);
  assertEntitled(store.entitlement);
  const requestedPeriod = Number(rawPeriod);
  const periodDays = requestedPeriod === 1 || requestedPeriod === 7 ? requestedPeriod : 30;
  type MetricsRow = {
    orderCount: bigint;
    grossRevenue: bigint | null;
    discountAmount: bigint | null;
    averageTicket: number | null;
  };
  type OpportunityRow = {
    firstProductId: string;
    firstProductName: string;
    secondProductId: string;
    secondProductName: string;
    pairOrders: bigint;
    anchorOrders: bigint;
  };
  type OfferMetricsRow = MetricsRow & { offerId: string };
  const [metricsRows, opportunityRows, offerMetricsRows] = await Promise.all([
    getDb().$queryRaw<MetricsRow[]>`
      WITH eligible_orders AS (
        SELECT DISTINCT o."id", o."subtotal", o."total"
        FROM "orders" o
        WHERE o."tenantId" = ${session.tenantId}
          AND o."storeId" = ${store.id}
          AND o."status" = 'DELIVERED'
          AND o."paymentStatus" = 'PAID'
          AND o."deliveredAt" >= (
            ((now() AT TIME ZONE ${store.timeZone})::date - (${periodDays - 1} * interval '1 day'))
            AT TIME ZONE ${store.timeZone}
          )
          AND EXISTS (
            SELECT 1 FROM "order_price_adjustments" a
            JOIN "store_offers" so ON so."id" = a."sourceIdSnapshot"
            WHERE a."orderId" = o."id" AND so."tenantId" = o."tenantId" AND so."storeId" = o."storeId"
          )
      ), discounts AS (
        SELECT COALESCE(SUM(a."amount"), 0)::bigint AS amount
        FROM "order_price_adjustments" a
        JOIN eligible_orders eo ON eo."id" = a."orderId"
        JOIN "store_offers" so ON so."id" = a."sourceIdSnapshot"
        WHERE so."tenantId" = ${session.tenantId} AND so."storeId" = ${store.id}
      )
      SELECT COUNT(*)::bigint AS "orderCount",
             COALESCE(SUM(eo."subtotal"), 0)::bigint AS "grossRevenue",
             (SELECT amount FROM discounts) AS "discountAmount",
             COALESCE(AVG(eo."total"), 0)::float8 AS "averageTicket"
      FROM eligible_orders eo
    `,
    getDb().$queryRaw<OpportunityRow[]>`
      WITH eligible_orders AS (
        SELECT o."id"
        FROM "orders" o
        WHERE o."tenantId" = ${session.tenantId}
          AND o."storeId" = ${store.id}
          AND o."status" = 'DELIVERED'
          AND o."paymentStatus" = 'PAID'
          AND o."deliveredAt" >= now() - interval '90 days'
      ), order_products AS (
        SELECT DISTINCT i."orderId", i."productId"
        FROM "order_items" i JOIN eligible_orders eo ON eo."id" = i."orderId"
        WHERE i."offerGroupId" IS NULL
      ), product_counts AS (
        SELECT "productId", COUNT(*)::bigint AS orders
        FROM order_products GROUP BY "productId"
        HAVING COUNT(*) >= 20
        ORDER BY orders DESC, "productId" ASC LIMIT 100
      ), pairs AS (
        SELECT a."productId" AS first_id, b."productId" AS second_id, COUNT(*)::bigint AS pair_orders
        FROM order_products a
        JOIN order_products b ON b."orderId" = a."orderId" AND b."productId" > a."productId"
        JOIN product_counts pa ON pa."productId" = a."productId"
        JOIN product_counts pb ON pb."productId" = b."productId"
        GROUP BY a."productId", b."productId"
        HAVING COUNT(*) >= 5 AND COUNT(*)::numeric / LEAST(MAX(pa.orders), MAX(pb.orders)) >= 0.25
      )
      SELECT p.first_id AS "firstProductId", p1."name" AS "firstProductName",
             p.second_id AS "secondProductId", p2."name" AS "secondProductName",
             p.pair_orders AS "pairOrders", LEAST(pc1.orders, pc2.orders) AS "anchorOrders"
      FROM pairs p
      JOIN product_counts pc1 ON pc1."productId" = p.first_id
      JOIN product_counts pc2 ON pc2."productId" = p.second_id
      JOIN "products" p1 ON p1."id" = p.first_id AND p1."tenantId" = ${session.tenantId} AND p1."storeId" = ${store.id}
      JOIN "products" p2 ON p2."id" = p.second_id AND p2."tenantId" = ${session.tenantId} AND p2."storeId" = ${store.id}
      WHERE p1."archivedAt" IS NULL AND p2."archivedAt" IS NULL
        AND NOT EXISTS (
          SELECT 1
          FROM "store_offers" so
          JOIN "store_offer_combo_groups" cg ON cg."offerId" = so."id"
          JOIN "store_offer_combo_choices" cc ON cc."groupId" = cg."id"
          WHERE so."tenantId" = ${session.tenantId}
            AND so."storeId" = ${store.id}
            AND so."archivedAt" IS NULL
            AND so."kind" IN ('COMBO_FIXED', 'COMBO_FLEXIBLE')
          GROUP BY so."id"
          HAVING ARRAY_AGG(DISTINCT cc."productId" ORDER BY cc."productId") = ARRAY[p.first_id, p.second_id]::text[]
        )
      ORDER BY p.pair_orders DESC, p.first_id ASC, p.second_id ASC
      LIMIT 5
    `,
    getDb().$queryRaw<OfferMetricsRow[]>`
      WITH offer_orders AS (
        SELECT a."sourceIdSnapshot" AS offer_id,
               o."id" AS order_id,
               o."subtotal",
               o."total",
               SUM(a."amount")::bigint AS discount_amount
        FROM "orders" o
        JOIN "order_price_adjustments" a ON a."orderId" = o."id"
        JOIN "store_offers" so ON so."id" = a."sourceIdSnapshot"
          AND so."tenantId" = o."tenantId" AND so."storeId" = o."storeId"
        WHERE o."tenantId" = ${session.tenantId}
          AND o."storeId" = ${store.id}
          AND o."status" = 'DELIVERED'
          AND o."paymentStatus" = 'PAID'
          AND o."deliveredAt" >= (
            ((now() AT TIME ZONE ${store.timeZone})::date - (${periodDays - 1} * interval '1 day'))
            AT TIME ZONE ${store.timeZone}
          )
        GROUP BY a."sourceIdSnapshot", o."id", o."subtotal", o."total"
      )
      SELECT offer_id AS "offerId",
             COUNT(*)::bigint AS "orderCount",
             COALESCE(SUM("subtotal"), 0)::bigint AS "grossRevenue",
             COALESCE(SUM(discount_amount), 0)::bigint AS "discountAmount",
             COALESCE(AVG("total"), 0)::float8 AS "averageTicket"
      FROM offer_orders
      GROUP BY offer_id
      ORDER BY offer_id ASC
    `,
  ]);
  const metrics = metricsRows[0];
  return {
    periodDays,
    metrics: {
      orderCount: Number(metrics?.orderCount ?? 0),
      grossRevenue: Number(metrics?.grossRevenue ?? 0),
      discountAmount: Number(metrics?.discountAmount ?? 0),
      averageTicket: Math.round(metrics?.averageTicket ?? 0),
    },
    opportunities: opportunityRows.map((row) => ({
      firstProductId: row.firstProductId,
      firstProductName: row.firstProductName,
      secondProductId: row.secondProductId,
      secondProductName: row.secondProductName,
      pairOrders: Number(row.pairOrders),
      share: Number(row.anchorOrders) > 0 ? Number(row.pairOrders) / Number(row.anchorOrders) : 0,
    })),
    offerMetrics: offerMetricsRows.map((row) => ({
      offerId: row.offerId,
      orderCount: Number(row.orderCount),
      grossRevenue: Number(row.grossRevenue ?? 0),
      discountAmount: Number(row.discountAmount ?? 0),
      averageTicket: Math.round(row.averageTicket ?? 0),
    })),
  };
}

export async function getComboForActiveStore(rawId: unknown) {
  const { session, store } = await requireActiveStoreContext(Permission.MANAGE_OFFERS);
  assertEntitled(store.entitlement);
  const combo = await offerRepo.findScopedCombo(
    getDb(),
    session.tenantId,
    store.id,
    parseId(rawId),
  );
  if (!combo) throw new NotFoundError('Combo');
  return { store, combo };
}

export async function getProductPromotionForActiveStore(rawId: unknown) {
  const { session, store } = await requireActiveStoreContext(Permission.MANAGE_OFFERS);
  assertEntitled(store.entitlement);
  const promotion = await offerRepo.findScopedPromotion(
    getDb(),
    session.tenantId,
    store.id,
    parseId(rawId),
  );
  if (!promotion) throw new NotFoundError('Promoção');
  return { store, promotion };
}

export async function createCanonicalOfferForActiveStore(rawInput: CanonicalOfferAdminInput) {
  const { session, store } = await requireActiveStoreContext(Permission.MANAGE_OFFERS);
  assertEntitled(store.entitlement);
  const input = parseCanonicalOffer(rawInput);
  const offer = await serializableTransaction(async (tx) => {
    const productId = input.productId;
    const product = productId
      ? (await offerRepo.findScopedProducts(tx, session.tenantId, store.id, [productId]))[0]
      : null;
    if (productId && (!product || product.archivedAt)) {
      throw new BusinessRuleError('O produto selecionado não está disponível no catálogo.');
    }
    if (input.kind === 'PRODUCT_FIXED_PRICE' && input.fixedPrice! >= product!.basePrice) {
      throw new BusinessRuleError(
        'O preço promocional deve ser menor que o preço atual do produto.',
      );
    }
    if (input.kind === 'QUANTITY_FIXED_PRICE') {
      const regular = multiplyCents(product!.basePrice, input.requiredQuantity!);
      if (input.fixedPrice! >= regular) {
        throw new BusinessRuleError(
          'O preço do grupo deve ser menor que a soma regular dos itens.',
        );
      }
    }
    if (input.kind === 'COMBO_FLEXIBLE') {
      const groups = input.groups!;
      const productIds = [
        ...new Set(groups.flatMap((group) => group.choices.map((choice) => choice.productId))),
      ];
      const products = await offerRepo.findScopedProducts(
        tx,
        session.tenantId,
        store.id,
        productIds,
      );
      if (
        products.length !== productIds.length ||
        products.some((candidate) => candidate.archivedAt)
      ) {
        throw new BusinessRuleError('Uma ou mais escolhas não estão disponíveis no catálogo.');
      }
      const byId = new Map(products.map((candidate) => [candidate.id, candidate]));
      if (
        groups.some((group) =>
          group.choices.some(
            (choice) => choice.priceDelta >= byId.get(choice.productId)!.basePrice,
          ),
        )
      ) {
        throw new BusinessRuleError(
          'O adicional de uma escolha deve ser menor que o preço regular do produto.',
        );
      }
      const minimumNetRegular = sumCents(
        groups.map((group) =>
          multiplyCents(
            Math.min(
              ...group.choices.map(
                (choice) => byId.get(choice.productId)!.basePrice - choice.priceDelta,
              ),
            ),
            group.quantity,
          ),
        ),
      );
      if (input.fixedPrice! >= minimumNetRegular) {
        throw new BusinessRuleError(
          'O preço do combo deve gerar economia para todas as combinações.',
        );
      }
    }

    const lockKey = productId ? `${store.id}:product:${productId}` : `${store.id}:${input.kind}`;
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
    const conflicts =
      input.kind === 'COMBO_FLEXIBLE'
        ? []
        : await tx.storeOffer.findMany({
            where: {
              tenantId: session.tenantId,
              storeId: store.id,
              isActive: true,
              archivedAt: null,
              ...(productId
                ? {
                    OR: [
                      { productPrice: { productId } },
                      { quantityPrice: { productId } },
                      { bogo: { productId } },
                    ],
                  }
                : { kind: input.kind }),
            },
            select: {
              id: true,
              name: true,
              startsOn: true,
              endsOnExclusive: true,
              weekdays: true,
              startMinute: true,
              endMinuteExclusive: true,
            },
          });
    if (
      input.isActive &&
      conflicts.some((candidate) =>
        offerSchedulesOverlap(
          {
            startsOn: input.startsOn,
            endsOnExclusive: input.endsOnExclusive,
            weekdays: input.weekdays,
            startMinute: input.startTime,
            endMinuteExclusive: input.endTimeExclusive,
          },
          candidate,
        ),
      )
    ) {
      throw new ConflictError('A agenda se sobrepõe a outra oferta automática deste escopo.');
    }

    const subtype =
      input.kind === 'COMBO_FLEXIBLE'
        ? {
            combo: {
              create: {
                fixedPrice: input.fixedPrice!,
                groups: {
                  create: input.groups!.map((group, groupPosition) => ({
                    name: group.name,
                    quantity: group.quantity,
                    position: groupPosition,
                    choices: {
                      create: group.choices.map((choice, choicePosition) => ({
                        productId: choice.productId,
                        priceDelta: choice.priceDelta,
                        position: choicePosition,
                      })),
                    },
                  })),
                },
              },
            },
          }
        : input.kind === 'PRODUCT_FIXED_PRICE'
          ? { productPrice: { create: { productId: productId!, fixedPrice: input.fixedPrice! } } }
          : input.kind === 'QUANTITY_FIXED_PRICE'
            ? {
                quantityPrice: {
                  create: {
                    productId: productId!,
                    requiredQuantity: input.requiredQuantity!,
                    groupFixedPrice: input.fixedPrice!,
                  },
                },
              }
            : input.kind === 'BOGO'
              ? {
                  bogo: {
                    create: {
                      productId: productId!,
                      buyQuantity: input.buyQuantity!,
                      getQuantity: input.getQuantity!,
                    },
                  },
                }
              : input.kind === 'CART_FIXED_DISCOUNT'
                ? {
                    cartDiscount: {
                      create: {
                        discountType: 'FIXED' as const,
                        value: input.discountValue!,
                        minSubtotal: input.minSubtotal ?? 0,
                      },
                    },
                  }
                : {
                    freeDelivery: { create: { minSubtotal: input.minSubtotal ?? 0 } },
                  };
    const created = await tx.storeOffer.create({
      data: {
        tenantId: session.tenantId,
        storeId: store.id,
        kind: input.kind,
        name: input.name,
        description: input.description,
        isActive: input.isActive,
        modalities: input.kind === 'FREE_DELIVERY' ? ['DELIVERY'] : input.modalities,
        maxApplicationsPerOrder: input.maxApplicationsPerOrder,
        maxTotalUses: input.maxTotalUses ?? null,
        maxUsesPerCustomer: input.maxUsesPerCustomer ?? null,
        ...canonicalScheduleWriteData(input as ParsedCanonicalOfferAdminInput),
        ...subtype,
      },
      select: { id: true, name: true, kind: true },
    });
    await createAuditLog(
      {
        tenantId: session.tenantId,
        storeId: store.id,
        userId: session.userId,
        action: 'PRODUCT_PROMOTION_CREATED',
        entity: 'StoreOffer',
        entityId: created.id,
        metadata: { kind: created.kind, name: created.name },
      },
      tx,
    );
    return created;
  });
  return { offer, storeId: store.id, storeSlug: store.slug };
}

export async function createComboForActiveStore(rawInput: ComboAdminInput) {
  const { session, store } = await requireActiveStoreContext(Permission.MANAGE_OFFERS);
  assertEntitled(store.entitlement);
  const input = parseCombo(rawInput);
  const combo = await serializableTransaction(async (tx) => {
    const { regularBaseAmount } = await validateComboProducts(
      tx,
      session.tenantId,
      store.id,
      input,
    );
    const created = await offerRepo.createScopedCombo(tx, {
      tenantId: session.tenantId,
      storeId: store.id,
      name: input.name,
      description: input.description,
      specialPrice: input.specialPrice,
      isActive: input.isActive,
      sortOrder: input.sortOrder,
      ...scheduleWriteData(input),
      items: {
        createMany: {
          data: input.items.map((item, position) => ({
            productId: item.productId,
            quantity: item.quantity,
            position,
          })),
        },
      },
    });
    await tx.storeOffer.create({
      data: {
        id: created.id,
        tenantId: session.tenantId,
        storeId: store.id,
        kind: 'COMBO_FIXED',
        name: created.name,
        description: created.description,
        isActive: created.isActive,
        sortOrder: created.sortOrder,
        version: created.version,
        ...canonicalScheduleWriteData(input),
        combo: {
          create: {
            fixedPrice: created.specialPrice,
            groups: { create: canonicalComboGroups(created.items) },
          },
        },
      },
    });
    await createAuditLog(
      {
        tenantId: session.tenantId,
        storeId: store.id,
        userId: session.userId,
        action: 'COMBO_CREATED',
        entity: 'StoreCombo',
        entityId: created.id,
        metadata: { name: created.name, specialPrice: created.specialPrice, regularBaseAmount },
      },
      tx,
    );
    return created;
  });
  return { combo, storeId: store.id, storeSlug: store.slug };
}

export async function updateComboForActiveStore(
  rawId: unknown,
  rawVersion: unknown,
  rawInput: ComboAdminInput,
) {
  const { session, store } = await requireActiveStoreContext(Permission.MANAGE_OFFERS);
  assertEntitled(store.entitlement);
  const id = parseId(rawId);
  const expectedVersion = parseVersion(rawVersion);
  const input = parseCombo(rawInput);
  const combo = await serializableTransaction(async (tx) => {
    const previous = await offerRepo.findScopedCombo(tx, session.tenantId, store.id, id);
    if (!previous) throw new NotFoundError('Combo');
    if (previous.version !== expectedVersion) throw new ConcurrencyError('Combo');
    const { regularBaseAmount } = await validateComboProducts(
      tx,
      session.tenantId,
      store.id,
      input,
    );
    const updated = await offerRepo.replaceScopedCombo(
      tx,
      id,
      {
        name: input.name,
        description: input.description,
        specialPrice: input.specialPrice,
        isActive: input.isActive,
        sortOrder: input.sortOrder,
        ...scheduleWriteData(input),
      },
      input.items.map((item, position) => ({
        productId: item.productId,
        quantity: item.quantity,
        position,
      })),
    );
    await tx.storeOffer.update({
      where: { id },
      data: {
        name: updated.name,
        description: updated.description,
        isActive: updated.isActive,
        sortOrder: updated.sortOrder,
        version: updated.version,
        ...canonicalScheduleWriteData(input),
        combo: {
          update: {
            fixedPrice: updated.specialPrice,
            groups: {
              deleteMany: {},
              create: canonicalComboGroups(updated.items),
            },
          },
        },
      },
    });
    await createAuditLog(
      {
        tenantId: session.tenantId,
        storeId: store.id,
        userId: session.userId,
        action: 'COMBO_UPDATED',
        entity: 'StoreCombo',
        entityId: id,
        metadata: {
          versionBefore: previous.version,
          versionAfter: updated.version,
          regularBaseAmount,
        },
      },
      tx,
    );
    return updated;
  });
  return { combo, storeId: store.id, storeSlug: store.slug };
}

export async function archiveComboForActiveStore(rawId: unknown, rawVersion: unknown) {
  const { session, store } = await requireActiveStoreContext(Permission.MANAGE_OFFERS);
  assertEntitled(store.entitlement);
  const id = parseId(rawId);
  const expectedVersion = parseVersion(rawVersion);
  await serializableTransaction(async (tx) => {
    const previous = await offerRepo.findScopedCombo(tx, session.tenantId, store.id, id);
    if (!previous) throw new NotFoundError('Combo');
    if (previous.version !== expectedVersion) throw new ConcurrencyError('Combo');
    await tx.storeCombo.update({
      where: { id },
      data: { archivedAt: new Date(), isActive: false, version: { increment: 1 } },
    });
    await tx.storeOffer.update({
      where: { id },
      data: { archivedAt: new Date(), isActive: false, version: { increment: 1 } },
    });
    await createAuditLog(
      {
        tenantId: session.tenantId,
        storeId: store.id,
        userId: session.userId,
        action: 'COMBO_ARCHIVED',
        entity: 'StoreCombo',
        entityId: id,
        metadata: { name: previous.name },
      },
      tx,
    );
  });
  return { storeId: store.id, storeSlug: store.slug };
}

export async function createProductPromotionForActiveStore(rawInput: ProductPromotionAdminInput) {
  const { session, store } = await requireActiveStoreContext(Permission.MANAGE_OFFERS);
  assertEntitled(store.entitlement);
  const input = parsePromotion(rawInput);
  const promotion = await serializableTransaction(async (tx) => {
    const product = await validatePromotionProduct(tx, session.tenantId, store.id, input);
    await assertPromotionWindowAvailable(tx, session.tenantId, store.id, input);
    const created = await offerRepo.createScopedPromotion(tx, {
      tenantId: session.tenantId,
      storeId: store.id,
      productId: input.productId,
      promotionalPrice: input.promotionalPrice,
      isActive: input.isActive,
      ...scheduleWriteData(input),
    });
    await tx.storeOffer.create({
      data: {
        id: created.id,
        tenantId: session.tenantId,
        storeId: store.id,
        kind: 'PRODUCT_FIXED_PRICE',
        name: `Promoção: ${product.name}`.slice(0, 120),
        isActive: created.isActive,
        version: created.version,
        ...canonicalScheduleWriteData(input),
        productPrice: {
          create: {
            productId: created.productId,
            fixedPrice: created.promotionalPrice,
          },
        },
      },
    });
    await createAuditLog(
      {
        tenantId: session.tenantId,
        storeId: store.id,
        userId: session.userId,
        action: 'PRODUCT_PROMOTION_CREATED',
        entity: 'StoreProductPromotion',
        entityId: created.id,
        metadata: { productId: product.id, promotionalPrice: created.promotionalPrice },
      },
      tx,
    );
    return created;
  });
  return { promotion, storeId: store.id, storeSlug: store.slug };
}

export async function updateProductPromotionForActiveStore(
  rawId: unknown,
  rawVersion: unknown,
  rawInput: ProductPromotionAdminInput,
) {
  const { session, store } = await requireActiveStoreContext(Permission.MANAGE_OFFERS);
  assertEntitled(store.entitlement);
  const id = parseId(rawId);
  const expectedVersion = parseVersion(rawVersion);
  const input = parsePromotion(rawInput);
  const promotion = await serializableTransaction(async (tx) => {
    const previous = await offerRepo.findScopedPromotion(tx, session.tenantId, store.id, id);
    if (!previous) throw new NotFoundError('Promoção');
    if (previous.version !== expectedVersion) throw new ConcurrencyError('Promoção');
    await validatePromotionProduct(tx, session.tenantId, store.id, input);
    await assertPromotionWindowAvailable(tx, session.tenantId, store.id, input, id);
    const updated = await offerRepo.updateScopedPromotion(tx, id, {
      productId: input.productId,
      promotionalPrice: input.promotionalPrice,
      isActive: input.isActive,
      ...scheduleWriteData(input),
    });
    await tx.storeOffer.update({
      where: { id },
      data: {
        name: `Promoção: ${updated.product.name}`.slice(0, 120),
        isActive: updated.isActive,
        version: updated.version,
        ...canonicalScheduleWriteData(input),
        productPrice: {
          update: {
            productId: updated.productId,
            fixedPrice: updated.promotionalPrice,
          },
        },
      },
    });
    await createAuditLog(
      {
        tenantId: session.tenantId,
        storeId: store.id,
        userId: session.userId,
        action: 'PRODUCT_PROMOTION_UPDATED',
        entity: 'StoreProductPromotion',
        entityId: id,
        metadata: { versionBefore: previous.version, versionAfter: updated.version },
      },
      tx,
    );
    return updated;
  });
  return { promotion, storeId: store.id, storeSlug: store.slug };
}

export async function archiveProductPromotionForActiveStore(rawId: unknown, rawVersion: unknown) {
  const { session, store } = await requireActiveStoreContext(Permission.MANAGE_OFFERS);
  assertEntitled(store.entitlement);
  const id = parseId(rawId);
  const expectedVersion = parseVersion(rawVersion);
  await serializableTransaction(async (tx) => {
    const previous = await offerRepo.findScopedPromotion(tx, session.tenantId, store.id, id);
    if (!previous) throw new NotFoundError('Promoção');
    if (previous.version !== expectedVersion) throw new ConcurrencyError('Promoção');
    await tx.storeProductPromotion.update({
      where: { id },
      data: { archivedAt: new Date(), isActive: false, version: { increment: 1 } },
    });
    await tx.storeOffer.update({
      where: { id },
      data: { archivedAt: new Date(), isActive: false, version: { increment: 1 } },
    });
    await createAuditLog(
      {
        tenantId: session.tenantId,
        storeId: store.id,
        userId: session.userId,
        action: 'PRODUCT_PROMOTION_ARCHIVED',
        entity: 'StoreProductPromotion',
        entityId: id,
        metadata: { productId: previous.productId },
      },
      tx,
    );
  });
  return { storeId: store.id, storeSlug: store.slug };
}

export async function setComboActiveForActiveStore(
  rawId: unknown,
  rawVersion: unknown,
  isActive: boolean,
) {
  const { session, store } = await requireActiveStoreContext(Permission.MANAGE_OFFERS);
  assertEntitled(store.entitlement);
  const id = parseId(rawId);
  const expectedVersion = parseVersion(rawVersion);
  await serializableTransaction(async (tx) => {
    const previous = await offerRepo.findScopedCombo(tx, session.tenantId, store.id, id);
    if (!previous || previous.archivedAt) throw new NotFoundError('Combo');
    if (previous.version !== expectedVersion) throw new ConcurrencyError('Combo');
    await tx.storeCombo.update({
      where: { id },
      data: { isActive, version: { increment: 1 } },
    });
    await tx.storeOffer.update({
      where: { id },
      data: { isActive, version: { increment: 1 } },
    });
    await createAuditLog(
      {
        tenantId: session.tenantId,
        storeId: store.id,
        userId: session.userId,
        action: 'COMBO_UPDATED',
        entity: 'StoreCombo',
        entityId: id,
        metadata: { activeBefore: previous.isActive, activeAfter: isActive },
      },
      tx,
    );
  });
  return { storeId: store.id, storeSlug: store.slug };
}

export async function setProductPromotionActiveForActiveStore(
  rawId: unknown,
  rawVersion: unknown,
  isActive: boolean,
) {
  const { session, store } = await requireActiveStoreContext(Permission.MANAGE_OFFERS);
  assertEntitled(store.entitlement);
  const id = parseId(rawId);
  const expectedVersion = parseVersion(rawVersion);
  await serializableTransaction(async (tx) => {
    const previous = await offerRepo.findScopedPromotion(tx, session.tenantId, store.id, id);
    if (!previous || previous.archivedAt) throw new NotFoundError('Promoção');
    if (previous.version !== expectedVersion) throw new ConcurrencyError('Promoção');
    if (isActive) {
      await offerRepo.lockPromotionProduct(tx, store.id, previous.productId);
      const candidates = await offerRepo.listConflictingPromotionSchedules(
        tx,
        session.tenantId,
        store.id,
        previous.productId,
        id,
      );
      if (candidates.some((candidate) => offerSchedulesOverlap(previous, candidate))) {
        throw new ConflictError('A agenda se sobrepõe a outra promoção ativa deste produto.');
      }
    }
    await tx.storeProductPromotion.update({
      where: { id },
      data: { isActive, version: { increment: 1 } },
    });
    await tx.storeOffer.update({
      where: { id },
      data: { isActive, version: { increment: 1 } },
    });
    await createAuditLog(
      {
        tenantId: session.tenantId,
        storeId: store.id,
        userId: session.userId,
        action: 'PRODUCT_PROMOTION_UPDATED',
        entity: 'StoreProductPromotion',
        entityId: id,
        metadata: { activeBefore: previous.isActive, activeAfter: isActive },
      },
      tx,
    );
  });
  return { storeId: store.id, storeSlug: store.slug };
}

export async function setCanonicalOfferActiveForActiveStore(
  rawId: unknown,
  rawVersion: unknown,
  isActive: boolean,
) {
  const { session, store } = await requireActiveStoreContext(Permission.MANAGE_OFFERS);
  assertEntitled(store.entitlement);
  const id = parseId(rawId);
  const expectedVersion = parseVersion(rawVersion);
  await serializableTransaction(async (tx) => {
    const previous = await tx.storeOffer.findFirst({
      where: { id, tenantId: session.tenantId, storeId: store.id, archivedAt: null },
      select: { id: true, kind: true, name: true, isActive: true, version: true },
    });
    if (!previous) throw new NotFoundError('Oferta');
    if (previous.version !== expectedVersion) throw new ConcurrencyError('Oferta');
    const updated = await tx.storeOffer.updateMany({
      where: { id, tenantId: session.tenantId, storeId: store.id, version: expectedVersion },
      data: { isActive, version: { increment: 1 } },
    });
    if (updated.count !== 1) throw new ConcurrencyError('Oferta');
    await createAuditLog(
      {
        tenantId: session.tenantId,
        storeId: store.id,
        userId: session.userId,
        action: 'PRODUCT_PROMOTION_UPDATED',
        entity: 'StoreOffer',
        entityId: id,
        metadata: { kind: previous.kind, activeBefore: previous.isActive, activeAfter: isActive },
      },
      tx,
    );
  });
  return { storeId: store.id, storeSlug: store.slug };
}

export async function archiveCanonicalOfferForActiveStore(rawId: unknown, rawVersion: unknown) {
  const { session, store } = await requireActiveStoreContext(Permission.MANAGE_OFFERS);
  assertEntitled(store.entitlement);
  const id = parseId(rawId);
  const expectedVersion = parseVersion(rawVersion);
  await serializableTransaction(async (tx) => {
    const previous = await tx.storeOffer.findFirst({
      where: { id, tenantId: session.tenantId, storeId: store.id },
      select: { id: true, kind: true, name: true, version: true },
    });
    if (!previous) throw new NotFoundError('Oferta');
    if (previous.version !== expectedVersion) throw new ConcurrencyError('Oferta');
    const archivedAt = new Date();
    const updated = await tx.storeOffer.updateMany({
      where: { id, tenantId: session.tenantId, storeId: store.id, version: expectedVersion },
      data: { archivedAt, isActive: false, version: { increment: 1 } },
    });
    if (updated.count !== 1) throw new ConcurrencyError('Oferta');
    await createAuditLog(
      {
        tenantId: session.tenantId,
        storeId: store.id,
        userId: session.userId,
        action: 'PRODUCT_PROMOTION_ARCHIVED',
        entity: 'StoreOffer',
        entityId: id,
        metadata: { kind: previous.kind, name: previous.name },
      },
      tx,
    );
  });
  return { storeId: store.id, storeSlug: store.slug };
}

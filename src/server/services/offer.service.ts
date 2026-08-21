import { Prisma } from '@prisma/client';

import { isOfferScheduleActive, offerSchedulesOverlap } from '@/domain/offers/schedule';
import {
  comboAdminInputSchema,
  offerIdSchema,
  offerListQuerySchema,
  offerVersionSchema,
  productPromotionAdminInputSchema,
  type ComboAdminInput,
  type ParsedComboAdminInput,
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
  if (!parsed.success) throw new ValidationError('A oferta informada é inválida.', issues(parsed.error));
  return parsed.data;
}

function parseVersion(rawVersion: unknown) {
  const parsed = offerVersionSchema.safeParse(rawVersion);
  if (!parsed.success) throw new ValidationError('A versão da oferta é inválida.', issues(parsed.error));
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
  const regularBaseAmount = input.items.reduce(
    (total, item) => total + byId.get(item.productId)!.basePrice * item.quantity,
    0,
  );
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
    throw new BusinessRuleError('O preço promocional deve ser menor que o preço atual do produto.', [
      { path: 'promotionalPrice', basePrice: product.basePrice },
    ]);
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
  if (!parsed.success) throw new ValidationError('Os filtros informados são inválidos.', issues(parsed.error));

  const pageSize = 25;
  const take = parsed.data.page * pageSize;
  const comboWhere = parsed.data.kind === 'PRODUCT_PROMOTION' ? { id: { equals: '__none__' } } : statusWhere(parsed.data.status);
  const promotionWhere = parsed.data.kind === 'COMBO' ? { id: { equals: '__none__' } } : statusWhere(parsed.data.status);
  const [combos, promotions, comboCount, promotionCount] = await Promise.all([
    offerRepo.listScopedCombos(session.tenantId, store.id, comboWhere, take),
    offerRepo.listScopedPromotions(session.tenantId, store.id, promotionWhere, take),
    offerRepo.countScopedCombos(session.tenantId, store.id, comboWhere),
    offerRepo.countScopedPromotions(session.tenantId, store.id, promotionWhere),
  ]);
  const offers = [
    ...combos.map((offer) => ({ kind: 'COMBO' as const, offer })),
    ...promotions.map((offer) => ({ kind: 'PRODUCT_PROMOTION' as const, offer })),
  ]
    .sort((left, right) => right.offer.updatedAt.getTime() - left.offer.updatedAt.getTime())
    .slice((parsed.data.page - 1) * pageSize, parsed.data.page * pageSize);

  return {
    session,
    store,
    offers,
    total: comboCount + promotionCount,
    page: parsed.data.page,
    totalPages: Math.max(1, Math.ceil((comboCount + promotionCount) / pageSize)),
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

export async function createComboForActiveStore(rawInput: ComboAdminInput) {
  const { session, store } = await requireActiveStoreContext(Permission.MANAGE_OFFERS);
  assertEntitled(store.entitlement);
  const input = parseCombo(rawInput);
  const combo = await serializableTransaction(async (tx) => {
    const { regularBaseAmount } = await validateComboProducts(tx, session.tenantId, store.id, input);
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
        create: input.items.map((item, position) => ({
          tenantId: session.tenantId,
          storeId: store.id,
          productId: item.productId,
          quantity: item.quantity,
          position,
        })),
      },
    });
    await createAuditLog({
      tenantId: session.tenantId,
      storeId: store.id,
      userId: session.userId,
      action: 'COMBO_CREATED',
      entity: 'StoreCombo',
      entityId: created.id,
      metadata: { name: created.name, specialPrice: created.specialPrice, regularBaseAmount },
    }, tx);
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
    const { regularBaseAmount } = await validateComboProducts(tx, session.tenantId, store.id, input);
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
        tenantId: session.tenantId,
        storeId: store.id,
        productId: item.productId,
        quantity: item.quantity,
        position,
      })),
    );
    await createAuditLog({
      tenantId: session.tenantId,
      storeId: store.id,
      userId: session.userId,
      action: 'COMBO_UPDATED',
      entity: 'StoreCombo',
      entityId: id,
      metadata: { versionBefore: previous.version, versionAfter: updated.version, regularBaseAmount },
    }, tx);
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
    await tx.storeCombo.update({ where: { id }, data: { archivedAt: new Date(), isActive: false, version: { increment: 1 } } });
    await createAuditLog({ tenantId: session.tenantId, storeId: store.id, userId: session.userId, action: 'COMBO_ARCHIVED', entity: 'StoreCombo', entityId: id, metadata: { name: previous.name } }, tx);
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
    await createAuditLog({ tenantId: session.tenantId, storeId: store.id, userId: session.userId, action: 'PRODUCT_PROMOTION_CREATED', entity: 'StoreProductPromotion', entityId: created.id, metadata: { productId: product.id, promotionalPrice: created.promotionalPrice } }, tx);
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
    await createAuditLog({ tenantId: session.tenantId, storeId: store.id, userId: session.userId, action: 'PRODUCT_PROMOTION_UPDATED', entity: 'StoreProductPromotion', entityId: id, metadata: { versionBefore: previous.version, versionAfter: updated.version } }, tx);
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
    await tx.storeProductPromotion.update({ where: { id }, data: { archivedAt: new Date(), isActive: false, version: { increment: 1 } } });
    await createAuditLog({ tenantId: session.tenantId, storeId: store.id, userId: session.userId, action: 'PRODUCT_PROMOTION_ARCHIVED', entity: 'StoreProductPromotion', entityId: id, metadata: { productId: previous.productId } }, tx);
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
    await createAuditLog({
      tenantId: session.tenantId,
      storeId: store.id,
      userId: session.userId,
      action: 'COMBO_UPDATED',
      entity: 'StoreCombo',
      entityId: id,
      metadata: { activeBefore: previous.isActive, activeAfter: isActive },
    }, tx);
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
    await createAuditLog({
      tenantId: session.tenantId,
      storeId: store.id,
      userId: session.userId,
      action: 'PRODUCT_PROMOTION_UPDATED',
      entity: 'StoreProductPromotion',
      entityId: id,
      metadata: { activeBefore: previous.isActive, activeAfter: isActive },
    }, tx);
  });
  return { storeId: store.id, storeSlug: store.slug };
}

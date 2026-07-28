import { Prisma } from '@prisma/client';

import {
  couponAdminInputSchema,
  couponIdSchema,
  couponListQuerySchema,
  type CouponAdminInput,
  type ParsedCouponAdminInput,
} from '@/schemas/coupon';
import { getDb } from '@/server/database/client';
import { BusinessRuleError, ConflictError, NotFoundError, ValidationError } from '@/server/errors';
import { Permission } from '@/server/permissions';
import { createAuditLog } from '@/server/repositories/audit-log.repository';
import * as couponRepo from '@/server/repositories/coupon.repository';
import { requireActiveStoreContext } from '@/server/services/store-context.service';

function issues(error: { issues: Array<{ path: PropertyKey[]; message: string }> }) {
  return error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }));
}

function parseCouponInput(input: CouponAdminInput): ParsedCouponAdminInput {
  const parsed = couponAdminInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError('Revise os dados do cupom.', issues(parsed.error));
  }
  return parsed.data;
}

function parseCouponId(couponId: unknown) {
  const parsed = couponIdSchema.safeParse(couponId);
  if (!parsed.success) {
    throw new ValidationError('O cupom informado é inválido.', issues(parsed.error));
  }
  return parsed.data;
}

function isUniqueConstraintError(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

function isSerializableConflict(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2034';
}

async function serializableTransaction<T>(
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await getDb().$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (!isSerializableConflict(error) || attempt === maxAttempts) throw error;
    }
  }
  throw new Error('Unreachable serializable transaction state.');
}

function couponWriteData(input: ParsedCouponAdminInput) {
  return {
    code: input.code,
    type: input.type,
    value: input.value,
    minOrderValue: input.minOrderValue,
    maxDiscount: input.type === 'PERCENTAGE' ? input.maxDiscount : null,
    maxUsages: input.maxUsages,
    startsAt: input.startsAt,
    expiresAt: input.expiresAt,
    isActive: input.isActive,
  };
}

async function assertCodeAvailable(
  tx: Prisma.TransactionClient,
  tenantId: string,
  storeId: string,
  code: string,
  excludeCouponId?: string,
) {
  const duplicate = await couponRepo.findScopedCouponByCode(
    tx,
    tenantId,
    storeId,
    code,
    excludeCouponId,
  );
  if (duplicate) {
    throw new ConflictError('Já existe um cupom com este código nesta loja.');
  }
}

export async function listCouponsForActiveStore(rawQuery: { page?: unknown } = {}) {
  const { session, store } = await requireActiveStoreContext(Permission.VIEW_COUPONS);
  const parsed = couponListQuerySchema.safeParse({ page: rawQuery.page ?? 1 });
  if (!parsed.success) {
    throw new ValidationError('A página solicitada é inválida.', issues(parsed.error));
  }
  const pageSize = 25;
  const [coupons, total] = await Promise.all([
    couponRepo.listScopedCoupons(session.tenantId, store.id, {
      skip: (parsed.data.page - 1) * pageSize,
      take: pageSize,
    }),
    couponRepo.countScopedCoupons(session.tenantId, store.id),
  ]);
  return {
    session,
    store,
    coupons,
    total,
    page: parsed.data.page,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    referenceTime: Date.now(),
  };
}

export async function createCouponForActiveStore(rawInput: CouponAdminInput) {
  const { session, store } = await requireActiveStoreContext(Permission.MANAGE_COUPONS);
  const input = parseCouponInput(rawInput);

  try {
    const coupon = await serializableTransaction(async (tx) => {
      await assertCodeAvailable(tx, session.tenantId, store.id, input.code);
      const created = await couponRepo.createScopedCoupon(tx, {
        tenantId: session.tenantId,
        storeId: store.id,
        ...couponWriteData(input),
      });
      await createAuditLog(
        {
          tenantId: session.tenantId,
          storeId: store.id,
          userId: session.userId,
          action: 'COUPON_CREATED',
          entity: 'Coupon',
          entityId: created.id,
          metadata: {
            code: created.code,
            type: created.type,
            isActive: created.isActive,
          },
        },
        tx,
      );
      return created;
    });
    return { coupon, storeId: store.id, storeSlug: store.slug };
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new ConflictError('Já existe um cupom com este código nesta loja.');
    }
    throw error;
  }
}

export async function updateCouponForActiveStore(couponId: unknown, rawInput: CouponAdminInput) {
  const { session, store } = await requireActiveStoreContext(Permission.MANAGE_COUPONS);
  const id = parseCouponId(couponId);
  const input = parseCouponInput(rawInput);

  try {
    const coupon = await serializableTransaction(async (tx) => {
      const previous = await couponRepo.findScopedCoupon(tx, session.tenantId, store.id, id);
      if (!previous) throw new NotFoundError('Cupom');
      if (input.maxUsages !== null && input.maxUsages < previous.usageCount) {
        throw new BusinessRuleError(
          `O limite não pode ser menor que os ${previous.usageCount} usos já registrados.`,
        );
      }

      await assertCodeAvailable(tx, session.tenantId, store.id, input.code, id);
      const updated = await couponRepo.updateScopedCoupon(tx, id, couponWriteData(input));
      await createAuditLog(
        {
          tenantId: session.tenantId,
          storeId: store.id,
          userId: session.userId,
          action: 'COUPON_UPDATED',
          entity: 'Coupon',
          entityId: id,
          metadata: {
            codeBefore: previous.code,
            codeAfter: updated.code,
            activeBefore: previous.isActive,
            activeAfter: updated.isActive,
            typeBefore: previous.type,
            typeAfter: updated.type,
          },
        },
        tx,
      );
      return updated;
    });
    return { coupon, storeId: store.id, storeSlug: store.slug };
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new ConflictError('Já existe um cupom com este código nesta loja.');
    }
    throw error;
  }
}

export async function deleteCouponForActiveStore(couponId: unknown) {
  const { session, store } = await requireActiveStoreContext(Permission.MANAGE_COUPONS);
  const id = parseCouponId(couponId);

  await serializableTransaction(async (tx) => {
    const coupon = await couponRepo.findScopedCoupon(tx, session.tenantId, store.id, id);
    if (!coupon) throw new NotFoundError('Cupom');
    const recordedUsages = Math.max(coupon.usageCount, coupon._count.usages);
    if (recordedUsages > 0) {
      throw new BusinessRuleError(
        'Este cupom possui histórico de uso. Desative-o para preservar a auditoria dos pedidos.',
      );
    }

    await couponRepo.deleteScopedCoupon(tx, id);
    await createAuditLog(
      {
        tenantId: session.tenantId,
        storeId: store.id,
        userId: session.userId,
        action: 'COUPON_DELETED',
        entity: 'Coupon',
        entityId: id,
        metadata: { code: coupon.code, usageCount: recordedUsages },
      },
      tx,
    );
  });

  return { storeId: store.id, storeSlug: store.slug };
}

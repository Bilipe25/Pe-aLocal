import 'server-only';

import { Prisma } from '@prisma/client';

import {
  loyaltyProgramInputSchema,
  type LoyaltyProgramInput,
  type LoyaltyRewardType,
} from '@/schemas/loyalty';
import { getDb } from '@/server/database/client';
import { AuthorizationError, NotFoundError, ValidationError } from '@/server/errors';
import { Permission } from '@/server/permissions';
import { requireActiveStoreContext } from '@/server/services/store-context.service';
import type { AuthorizedLoyaltyReward } from '@/server/services/checkout-quote.service';
import { createLoyaltyNotificationEvent } from '@/server/services/operational-outbox.service';

type LoyaltyTx = Prisma.TransactionClient;
const DAY_MS = 24 * 60 * 60 * 1_000;

async function requireLoyaltyContext(permission: Permission) {
  const context = await requireActiveStoreContext(permission);
  if (!context.store.entitlement?.loyaltyEnabled) throw new NotFoundError('Página');
  if (!context.store.entitlement.consumerIdentityEnabled) throw new NotFoundError('Página');
  return context;
}

async function databaseNow(client: LoyaltyTx | ReturnType<typeof getDb>) {
  const [clock] = await client.$queryRaw<Array<{ now: Date }>>(
    Prisma.sql`SELECT CURRENT_TIMESTAMP AS "now"`,
  );
  return clock?.now ?? new Date();
}

export async function expireAvailableLoyaltyRewards(
  client: LoyaltyTx | ReturnType<typeof getDb>,
  input: { tenantId: string; storeId: string; consumerIdentityId?: string },
) {
  const now = await databaseNow(client);
  const expired = await client.loyaltyReward.updateMany({
    where: {
      tenantId: input.tenantId,
      storeId: input.storeId,
      consumerIdentityId: input.consumerIdentityId,
      status: 'AVAILABLE',
      expiresAt: { lte: now },
    },
    data: { status: 'EXPIRED', expiredAt: now },
  });
  return { count: expired.count, now };
}

function rewardSnapshot(input: {
  rewardType: LoyaltyRewardType;
  rewardValue: number | null;
  percentageBasisPoints: number | null;
  maximumDiscountValue: number | null;
  freeProductId: string | null;
  freeProductNameSnapshot: string | null;
  freeProductBaseValue: number | null;
}) {
  return {
    rewardType: input.rewardType,
    rewardValue: input.rewardType === 'FIXED_DISCOUNT' ? input.rewardValue : null,
    percentageBasisPoints:
      input.rewardType === 'PERCENT_DISCOUNT' ? input.percentageBasisPoints : null,
    maximumDiscountValue:
      input.rewardType === 'PERCENT_DISCOUNT' ? input.maximumDiscountValue : null,
    freeProductId: input.rewardType === 'FREE_PRODUCT' ? input.freeProductId : null,
    freeProductNameSnapshot:
      input.rewardType === 'FREE_PRODUCT' ? input.freeProductNameSnapshot : null,
    freeProductBaseValue: input.rewardType === 'FREE_PRODUCT' ? input.freeProductBaseValue : null,
  };
}

export async function getLoyaltyDashboard() {
  const context = await requireLoyaltyContext(Permission.VIEW_STORE_OPERATIONS);
  await expireAvailableLoyaltyRewards(getDb(), {
    tenantId: context.session.tenantId,
    storeId: context.store.id,
  });
  const [program, participating, earned, used, available, expired, ordersUsing, usedByType, value] =
    await Promise.all([
      getDb().loyaltyProgram.findFirst({
        where: { tenantId: context.session.tenantId, storeId: context.store.id },
        orderBy: [{ version: 'desc' }],
      }),
      getDb().loyaltyCycle.groupBy({
        by: ['consumerIdentityId'],
        where: { tenantId: context.session.tenantId, storeId: context.store.id },
      }),
      getDb().loyaltyReward.count({
        where: { tenantId: context.session.tenantId, storeId: context.store.id },
      }),
      getDb().loyaltyReward.count({
        where: {
          tenantId: context.session.tenantId,
          storeId: context.store.id,
          status: 'REDEEMED',
        },
      }),
      getDb().loyaltyReward.count({
        where: {
          tenantId: context.session.tenantId,
          storeId: context.store.id,
          status: 'AVAILABLE',
        },
      }),
      getDb().loyaltyReward.count({
        where: {
          tenantId: context.session.tenantId,
          storeId: context.store.id,
          status: 'EXPIRED',
        },
      }),
      getDb().loyaltyReward.count({
        where: {
          tenantId: context.session.tenantId,
          storeId: context.store.id,
          orderId: { not: null },
        },
      }),
      getDb().loyaltyReward.groupBy({
        by: ['rewardType'],
        where: {
          tenantId: context.session.tenantId,
          storeId: context.store.id,
          status: 'REDEEMED',
        },
        _count: { _all: true },
      }),
      getDb().orderPriceAdjustment.aggregate({
        where: {
          tenantId: context.session.tenantId,
          storeId: context.store.id,
          adjustmentType: 'LOYALTY',
        },
        _sum: { amount: true },
      }),
    ]);
  const products = context.store.entitlement?.loyaltyAdvancedRewardsEnabled
    ? await getDb().product.findMany({
        where: {
          tenantId: context.session.tenantId,
          storeId: context.store.id,
          archivedAt: null,
          isAvailable: true,
          category: { archivedAt: null, isActive: true },
        },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        select: { id: true, name: true, basePrice: true, isSoldOut: true },
      })
    : [];
  return {
    store: { id: context.store.id, name: context.store.name },
    program,
    products,
    advancedEnabled: Boolean(context.store.entitlement?.loyaltyAdvancedRewardsEnabled),
    canEdit: context.session.tenantRole === 'OWNER',
    metrics: {
      participating: participating.length,
      earned,
      used,
      available,
      expired,
      ordersUsing,
      benefitValueUsed: value._sum.amount ?? 0,
      usedByType: Object.fromEntries(
        usedByType.map((item) => [item.rewardType, item._count._all]),
      ) as Partial<Record<LoyaltyRewardType, number>>,
    },
  };
}

export async function saveLoyaltyProgram(rawInput: LoyaltyProgramInput) {
  const context = await requireLoyaltyContext(Permission.EDIT_STORE_OPERATIONS);
  if (context.session.tenantRole !== 'OWNER') {
    throw new AuthorizationError('Somente o proprietário pode alterar a fidelidade.');
  }
  const parsed = loyaltyProgramInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      'Revise as informações da fidelidade.',
      parsed.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
    );
  }

  return getDb().$transaction(async (tx) => {
    await tx.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`loyalty-program:${context.store.id}`}, 0))`,
    );
    const entitlement = await tx.storeEntitlement.findFirst({
      where: {
        tenantId: context.session.tenantId,
        storeId: context.store.id,
        loyaltyEnabled: true,
        consumerIdentityEnabled: true,
      },
      select: { id: true, loyaltyAdvancedRewardsEnabled: true },
    });
    if (!entitlement) throw new NotFoundError('Página');
    if (!entitlement.loyaltyAdvancedRewardsEnabled && parsed.data.rewardType !== 'FIXED_DISCOUNT') {
      throw new AuthorizationError(
        'Os benefícios avançados ainda não estão disponíveis nesta loja.',
      );
    }
    let freeProduct: { id: string; name: string; basePrice: number } | null = null;
    if (parsed.data.rewardType === 'FREE_PRODUCT') {
      freeProduct = await tx.product.findFirst({
        where: {
          id: parsed.data.freeProductId ?? undefined,
          tenantId: context.session.tenantId,
          storeId: context.store.id,
          archivedAt: null,
          isAvailable: true,
          isSoldOut: false,
          category: { archivedAt: null, isActive: true },
        },
        select: { id: true, name: true, basePrice: true },
      });
      if (!freeProduct) {
        throw new ValidationError('Escolha um produto disponível desta loja.', [
          { field: 'freeProductId', message: 'Escolha um produto disponível agora.' },
        ]);
      }
    }
    const latest = await tx.loyaltyProgram.findFirst({
      where: { tenantId: context.session.tenantId, storeId: context.store.id },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    await tx.loyaltyProgram.updateMany({
      where: {
        tenantId: context.session.tenantId,
        storeId: context.store.id,
        isActive: true,
      },
      data: { isActive: false },
    });
    const program = await tx.loyaltyProgram.create({
      data: {
        tenantId: context.session.tenantId,
        storeId: context.store.id,
        version: (latest?.version ?? 0) + 1,
        requiredOrders: parsed.data.requiredOrders,
        rewardType: parsed.data.rewardType,
        rewardValue:
          parsed.data.rewardType === 'FIXED_DISCOUNT' ? (parsed.data.rewardValue ?? null) : null,
        percentageBasisPoints:
          parsed.data.rewardType === 'PERCENT_DISCOUNT'
            ? (parsed.data.percentageBasisPoints ?? null)
            : null,
        maximumDiscountValue:
          parsed.data.rewardType === 'PERCENT_DISCOUNT'
            ? (parsed.data.maximumDiscountValue ?? null)
            : null,
        freeProductId: freeProduct?.id ?? null,
        freeProductNameSnapshot: freeProduct?.name ?? null,
        freeProductBaseValue: freeProduct?.basePrice ?? null,
        validityDays: entitlement.loyaltyAdvancedRewardsEnabled ? parsed.data.validityDays : null,
        minimumOrderValue: parsed.data.minimumOrderValue,
        isActive: parsed.data.isActive,
        createdById: context.session.userId,
      },
    });
    await tx.auditLog.create({
      data: {
        tenantId: context.session.tenantId,
        storeId: context.store.id,
        userId: context.session.userId,
        action: 'UPDATE',
        entity: 'LoyaltyProgram',
        entityId: program.id,
        metadata: {
          version: program.version,
          requiredOrders: program.requiredOrders,
          rewardValue: program.rewardValue,
          rewardType: program.rewardType,
          percentageBasisPoints: program.percentageBasisPoints,
          maximumDiscountValue: program.maximumDiscountValue,
          freeProductId: program.freeProductId,
          freeProductNameSnapshot: program.freeProductNameSnapshot,
          freeProductBaseValue: program.freeProductBaseValue,
          validityDays: program.validityDays,
          minimumOrderValue: program.minimumOrderValue,
          isActive: program.isActive,
        },
      },
    });
    console.info(
      JSON.stringify({
        event: program.isActive ? 'loyalty_program_enabled' : 'loyalty_program_disabled',
        storeId: context.store.id,
      }),
    );
    return program;
  });
}

async function verifiedIdentityForOrder(
  tx: LoyaltyTx,
  tenantId: string,
  storeId: string,
  orderId: string,
) {
  const order = await tx.order.findFirst({
    where: { id: orderId, tenantId, storeId, status: 'DELIVERED' },
    select: {
      id: true,
      deliveredAt: true,
      statusChangedAt: true,
      customer: {
        select: {
          consumerIdentity: {
            select: { id: true, emailVerifiedAt: true, phoneVerifiedAt: true },
          },
        },
      },
    },
  });
  const identity = order?.customer?.consumerIdentity;
  return identity && (identity.emailVerifiedAt || identity.phoneVerifiedAt)
    ? { ...identity, completedAt: order?.deliveredAt ?? order?.statusChangedAt ?? new Date() }
    : null;
}

export async function processLoyaltyForOrder(
  tx: LoyaltyTx,
  input: { tenantId: string; storeId: string; orderId: string },
) {
  const identity = await verifiedIdentityForOrder(tx, input.tenantId, input.storeId, input.orderId);
  if (!identity) return { credited: false as const, reason: 'identity_not_verified' as const };
  await tx.$executeRaw(
    Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`loyalty:${input.storeId}:${identity.id}`}, 0))`,
  );
  const existing = await tx.loyaltyContribution.findFirst({
    where: { tenantId: input.tenantId, storeId: input.storeId, orderId: input.orderId },
    select: { id: true },
  });
  if (existing) return { credited: false as const, reason: 'already_credited' as const };
  const entitlement = await tx.storeEntitlement.findFirst({
    where: {
      tenantId: input.tenantId,
      storeId: input.storeId,
      loyaltyEnabled: true,
      consumerIdentityEnabled: true,
    },
    select: { id: true },
  });
  if (!entitlement) return { credited: false as const, reason: 'disabled' as const };
  const program = await tx.loyaltyProgram.findFirst({
    where: {
      tenantId: input.tenantId,
      storeId: input.storeId,
      createdAt: { lte: identity.completedAt },
      OR: [{ isActive: true }, { updatedAt: { gte: identity.completedAt } }],
    },
    orderBy: { version: 'desc' },
  });
  if (!program) return { credited: false as const, reason: 'inactive' as const };
  let cycle = await tx.loyaltyCycle.findFirst({
    where: {
      tenantId: input.tenantId,
      storeId: input.storeId,
      consumerIdentityId: identity.id,
      status: 'ACTIVE',
    },
    orderBy: { startedAt: 'asc' },
  });
  if (!cycle) {
    cycle = await tx.loyaltyCycle.create({
      data: {
        tenantId: input.tenantId,
        storeId: input.storeId,
        consumerIdentityId: identity.id,
        programId: program.id,
        programVersion: program.version,
        requiredOrders: program.requiredOrders,
        ...rewardSnapshot(program),
        validityDays: program.validityDays,
        minimumOrderValue: program.minimumOrderValue,
      },
    });
  }
  await tx.loyaltyContribution.create({
    data: {
      tenantId: input.tenantId,
      storeId: input.storeId,
      consumerIdentityId: identity.id,
      cycleId: cycle.id,
      orderId: input.orderId,
    },
  });
  const nextProgress = cycle.progress + 1;
  if (nextProgress < cycle.requiredOrders) {
    await tx.loyaltyCycle.update({ where: { id: cycle.id }, data: { progress: nextProgress } });
    return { credited: true as const, rewardCreated: false as const, progress: nextProgress };
  }
  const completedAt = new Date();
  await tx.loyaltyCycle.update({
    where: { id: cycle.id },
    data: { progress: cycle.requiredOrders, status: 'COMPLETED', completedAt },
  });
  const reward = await tx.loyaltyReward.create({
    data: {
      tenantId: input.tenantId,
      storeId: input.storeId,
      consumerIdentityId: identity.id,
      cycleId: cycle.id,
      rewardType: cycle.rewardType,
      value: cycle.rewardType === 'FIXED_DISCOUNT' ? cycle.rewardValue : null,
      percentageBasisPoints: cycle.percentageBasisPoints,
      maximumDiscountValue: cycle.maximumDiscountValue,
      freeProductId: cycle.freeProductId,
      freeProductNameSnapshot: cycle.freeProductNameSnapshot,
      freeProductBaseValue: cycle.freeProductBaseValue,
      minimumOrderValue: cycle.minimumOrderValue,
      expiresAt: cycle.validityDays
        ? new Date(completedAt.getTime() + cycle.validityDays * DAY_MS)
        : null,
    },
  });
  await createLoyaltyNotificationEvent(tx, {
    tenantId: input.tenantId,
    storeId: input.storeId,
    consumerIdentityId: identity.id,
    rewardId: reward.id,
    eventType: 'LOYALTY_REWARD_EARNED',
    occurredAt: completedAt,
    expiresAt: reward.expiresAt,
  });
  console.info(JSON.stringify({ event: 'loyalty_cycle_completed', storeId: input.storeId }));
  console.info(JSON.stringify({ event: 'loyalty_reward_created', storeId: input.storeId }));
  return { credited: true as const, rewardCreated: true as const, rewardId: reward.id };
}

export async function queueExpiringLoyaltyNotifications(
  client: LoyaltyTx | ReturnType<typeof getDb>,
  input: { daysBeforeExpiry?: number; batchSize?: number } = {},
) {
  const now = await databaseNow(client);
  await client.loyaltyReward.updateMany({
    where: { status: 'AVAILABLE', expiresAt: { lte: now } },
    data: { status: 'EXPIRED', expiredAt: now },
  });
  const daysBeforeExpiry = input.daysBeforeExpiry ?? 3;
  const until = new Date(now.getTime() + daysBeforeExpiry * DAY_MS);
  const rewards = await client.loyaltyReward.findMany({
    where: {
      status: 'AVAILABLE',
      expiresAt: { gt: now, lte: until },
      store: {
        entitlement: { loyaltyEnabled: true, consumerIdentityEnabled: true },
      },
    },
    orderBy: [{ expiresAt: 'asc' }, { id: 'asc' }],
    take: Math.min(1_000, Math.max(1, input.batchSize ?? 500)),
    select: {
      id: true,
      tenantId: true,
      storeId: true,
      consumerIdentityId: true,
      expiresAt: true,
    },
  });
  if (rewards.length === 0) return { queued: 0, now };
  const result = await client.operationalOutboxEvent.createMany({
    data: rewards.map((reward) => ({
      tenantId: reward.tenantId,
      storeId: reward.storeId,
      aggregateType: 'LOYALTY_REWARD',
      aggregateId: reward.id,
      eventType: 'LOYALTY_REWARD_EXPIRING' as const,
      aggregateVersion: 1,
      schemaVersion: 1,
      occurredAt: now,
      payload: {
        consumerIdentityId: reward.consumerIdentityId,
        rewardId: reward.id,
        occurredAt: now.toISOString(),
        expiresAt: reward.expiresAt?.toISOString() ?? null,
      },
    })),
    skipDuplicates: true,
  });
  return { queued: result.count, now };
}

export async function processClaimedDeliveredOrders(
  tx: LoyaltyTx,
  input: { tenantId: string; storeId: string; customerId: string },
) {
  const orders = await tx.order.findMany({
    where: {
      tenantId: input.tenantId,
      storeId: input.storeId,
      customerId: input.customerId,
      status: 'DELIVERED',
      loyaltyContribution: null,
    },
    orderBy: [{ deliveredAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    select: { id: true },
  });
  for (const order of orders) {
    await processLoyaltyForOrder(tx, { ...input, orderId: order.id });
  }
}

export async function restoreLoyaltyRewardForCancelledOrder(
  tx: LoyaltyTx,
  input: { tenantId: string; storeId: string; orderId: string },
) {
  const now = await databaseNow(tx);
  const expired = await tx.loyaltyReward.updateMany({
    where: {
      tenantId: input.tenantId,
      storeId: input.storeId,
      orderId: input.orderId,
      status: { in: ['RESERVED', 'REDEEMED'] },
      expiresAt: { lte: now },
    },
    data: {
      status: 'EXPIRED',
      expiredAt: now,
      orderId: null,
      reservedAt: null,
      redeemedAt: null,
      cancelledAt: null,
    },
  });
  const restored = await tx.loyaltyReward.updateMany({
    where: {
      tenantId: input.tenantId,
      storeId: input.storeId,
      orderId: input.orderId,
      status: { in: ['RESERVED', 'REDEEMED'] },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    data: {
      status: 'AVAILABLE',
      expiredAt: null,
      orderId: null,
      reservedAt: null,
      redeemedAt: null,
      cancelledAt: null,
    },
  });
  if (restored.count + expired.count > 0) {
    console.info(JSON.stringify({ event: 'loyalty_reward_restored', storeId: input.storeId }));
  }
  return restored.count + expired.count;
}

export async function getCheckoutLoyaltyRewards(
  tx: LoyaltyTx,
  input: { tenantId: string; storeId: string; consumerIdentityId: string },
): Promise<AuthorizedLoyaltyReward[]> {
  const entitlement = await tx.storeEntitlement.findFirst({
    where: {
      tenantId: input.tenantId,
      storeId: input.storeId,
      loyaltyEnabled: true,
      consumerIdentityEnabled: true,
    },
    select: { id: true },
  });
  if (!entitlement) return [];
  const { now } = await expireAvailableLoyaltyRewards(tx, input);
  const rewards = await tx.loyaltyReward.findMany({
    where: {
      ...input,
      status: 'AVAILABLE',
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    orderBy: [{ expiresAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      rewardType: true,
      value: true,
      percentageBasisPoints: true,
      maximumDiscountValue: true,
      freeProductId: true,
      freeProductNameSnapshot: true,
      freeProductBaseValue: true,
      minimumOrderValue: true,
      expiresAt: true,
      createdAt: true,
    },
  });
  const productIds = rewards.flatMap((reward) =>
    reward.freeProductId ? [reward.freeProductId] : [],
  );
  const products = productIds.length
    ? await tx.product.findMany({
        where: { id: { in: productIds }, tenantId: input.tenantId, storeId: input.storeId },
        select: {
          id: true,
          isAvailable: true,
          isSoldOut: true,
          archivedAt: true,
          category: { select: { isActive: true, archivedAt: true } },
        },
      })
    : [];
  const productById = new Map(products.map((product) => [product.id, product]));
  return rewards.map((reward) => {
    const product = reward.freeProductId ? productById.get(reward.freeProductId) : null;
    const freeProductState =
      reward.rewardType !== 'FREE_PRODUCT'
        ? undefined
        : !product || product.archivedAt || product.category.archivedAt
          ? ('ARCHIVED' as const)
          : product.isSoldOut || !product.isAvailable || !product.category.isActive
            ? ('SOLD_OUT' as const)
            : ('AVAILABLE' as const);
    return { ...reward, freeProductState };
  });
}

export async function getConsumerLoyaltyState(input: {
  tenantId: string;
  storeId: string;
  consumerIdentityId?: string | null;
}) {
  const db = getDb();
  const entitlement = await db.storeEntitlement.findFirst({
    where: {
      tenantId: input.tenantId,
      storeId: input.storeId,
      loyaltyEnabled: true,
      consumerIdentityEnabled: true,
    },
    select: { id: true, loyaltyAdvancedRewardsEnabled: true },
  });
  if (!entitlement) return null;
  if (input.consumerIdentityId) {
    await expireAvailableLoyaltyRewards(db, {
      tenantId: input.tenantId,
      storeId: input.storeId,
      consumerIdentityId: input.consumerIdentityId,
    });
  }
  const activeProgram = await db.loyaltyProgram.findFirst({
    where: {
      tenantId: input.tenantId,
      storeId: input.storeId,
      isActive: true,
    },
    orderBy: { version: 'desc' },
  });
  if (!input.consumerIdentityId) {
    return activeProgram
      ? {
          program: activeProgram,
          programActive: true,
          advancedEnabled: entitlement.loyaltyAdvancedRewardsEnabled,
          cycle: null,
          rewards: [],
        }
      : null;
  }
  const [cycle, rewards] = await Promise.all([
    db.loyaltyCycle.findFirst({
      where: {
        tenantId: input.tenantId,
        storeId: input.storeId,
        consumerIdentityId: input.consumerIdentityId,
        status: 'ACTIVE',
      },
      orderBy: { startedAt: 'asc' },
    }),
    db.loyaltyReward.findMany({
      where: {
        tenantId: input.tenantId,
        storeId: input.storeId,
        consumerIdentityId: input.consumerIdentityId,
        status: 'AVAILABLE',
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        rewardType: true,
        value: true,
        percentageBasisPoints: true,
        maximumDiscountValue: true,
        freeProductId: true,
        freeProductNameSnapshot: true,
        freeProductBaseValue: true,
        minimumOrderValue: true,
        expiresAt: true,
        createdAt: true,
      },
    }),
  ]);
  if (!activeProgram && rewards.length === 0) return null;
  const program =
    activeProgram ??
    (await db.loyaltyProgram.findFirst({
      where: { tenantId: input.tenantId, storeId: input.storeId },
      orderBy: { version: 'desc' },
    }));
  if (!program) return null;
  return {
    program,
    programActive: Boolean(activeProgram),
    advancedEnabled: entitlement.loyaltyAdvancedRewardsEnabled,
    cycle: activeProgram ? cycle : null,
    rewards,
  };
}

export async function getConsumerLoyaltySummaryState(input: {
  tenantId: string;
  storeId: string;
  consumerIdentityId?: string | null;
}) {
  const db = getDb();
  const entitlement = await db.storeEntitlement.findFirst({
    where: {
      tenantId: input.tenantId,
      storeId: input.storeId,
      loyaltyEnabled: true,
      consumerIdentityEnabled: true,
    },
    select: { id: true },
  });
  if (!entitlement) return null;
  if (input.consumerIdentityId) {
    await expireAvailableLoyaltyRewards(db, {
      tenantId: input.tenantId,
      storeId: input.storeId,
      consumerIdentityId: input.consumerIdentityId,
    });
  }
  const [program, cycle, availableRewards, nearestReward] = await Promise.all([
    db.loyaltyProgram.findFirst({
      where: { tenantId: input.tenantId, storeId: input.storeId, isActive: true },
      orderBy: { version: 'desc' },
      select: {
        requiredOrders: true,
        rewardType: true,
        rewardValue: true,
        percentageBasisPoints: true,
        maximumDiscountValue: true,
        freeProductNameSnapshot: true,
      },
    }),
    input.consumerIdentityId
      ? db.loyaltyCycle.findFirst({
          where: {
            tenantId: input.tenantId,
            storeId: input.storeId,
            consumerIdentityId: input.consumerIdentityId,
            status: 'ACTIVE',
          },
          orderBy: { startedAt: 'asc' },
          select: {
            progress: true,
            requiredOrders: true,
            rewardType: true,
            rewardValue: true,
            percentageBasisPoints: true,
            maximumDiscountValue: true,
            freeProductNameSnapshot: true,
          },
        })
      : null,
    input.consumerIdentityId
      ? db.loyaltyReward.count({
          where: {
            tenantId: input.tenantId,
            storeId: input.storeId,
            consumerIdentityId: input.consumerIdentityId,
            status: 'AVAILABLE',
          },
        })
      : 0,
    input.consumerIdentityId
      ? db.loyaltyReward.findFirst({
          where: {
            tenantId: input.tenantId,
            storeId: input.storeId,
            consumerIdentityId: input.consumerIdentityId,
            status: 'AVAILABLE',
            expiresAt: { not: null },
          },
          orderBy: [{ expiresAt: 'asc' }, { id: 'asc' }],
          select: { expiresAt: true },
        })
      : null,
  ]);
  if (!program && !cycle && availableRewards === 0) return null;
  return { program, cycle, availableRewards, nearestExpiry: nearestReward?.expiresAt ?? null };
}

export async function getCustomerLoyaltySummary(input: {
  tenantId: string;
  storeId: string;
  consumerIdentityId?: string | null;
}) {
  if (!input.consumerIdentityId) return null;
  const consumerIdentityId = input.consumerIdentityId;
  await expireAvailableLoyaltyRewards(getDb(), {
    tenantId: input.tenantId,
    storeId: input.storeId,
    consumerIdentityId,
  });
  const [cycle, availableRewards, usedRewards] = await Promise.all([
    getDb().loyaltyCycle.findFirst({
      where: {
        tenantId: input.tenantId,
        storeId: input.storeId,
        consumerIdentityId,
        status: 'ACTIVE',
      },
      orderBy: { startedAt: 'asc' },
      select: { progress: true, requiredOrders: true },
    }),
    getDb().loyaltyReward.count({
      where: {
        tenantId: input.tenantId,
        storeId: input.storeId,
        consumerIdentityId,
        status: 'AVAILABLE',
      },
    }),
    getDb().loyaltyReward.count({
      where: {
        tenantId: input.tenantId,
        storeId: input.storeId,
        consumerIdentityId,
        status: 'REDEEMED',
      },
    }),
  ]);
  return { cycle, availableRewards, usedRewards };
}

import 'server-only';

import { Prisma } from '@prisma/client';

import { loyaltyProgramInputSchema, type LoyaltyProgramInput } from '@/schemas/loyalty';
import { getDb } from '@/server/database/client';
import { AuthorizationError, NotFoundError, ValidationError } from '@/server/errors';
import { Permission } from '@/server/permissions';
import { requireActiveStoreContext } from '@/server/services/store-context.service';

type LoyaltyTx = Prisma.TransactionClient;

async function requireLoyaltyContext(permission: Permission) {
  const context = await requireActiveStoreContext(permission);
  if (!context.store.entitlement?.loyaltyEnabled) throw new NotFoundError('Página');
  if (!context.store.entitlement.consumerIdentityEnabled) throw new NotFoundError('Página');
  return context;
}

export async function getLoyaltyDashboard() {
  const context = await requireLoyaltyContext(Permission.VIEW_STORE_OPERATIONS);
  const [program, participating, earned, used, ordersUsing] = await Promise.all([
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
        orderId: { not: null },
      },
    }),
  ]);
  return {
    store: { id: context.store.id, name: context.store.name },
    program,
    canEdit: context.session.tenantRole === 'OWNER',
    metrics: {
      participating: participating.length,
      earned,
      used,
      ordersUsing,
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
      select: { id: true },
    });
    if (!entitlement) throw new NotFoundError('Página');
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
        ...parsed.data,
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
        rewardValue: program.rewardValue,
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
      value: cycle.rewardValue,
      minimumOrderValue: cycle.minimumOrderValue,
    },
  });
  console.info(JSON.stringify({ event: 'loyalty_cycle_completed', storeId: input.storeId }));
  console.info(JSON.stringify({ event: 'loyalty_reward_created', storeId: input.storeId }));
  return { credited: true as const, rewardCreated: true as const, rewardId: reward.id };
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
  const restored = await tx.loyaltyReward.updateMany({
    where: {
      tenantId: input.tenantId,
      storeId: input.storeId,
      orderId: input.orderId,
      status: { in: ['RESERVED', 'REDEEMED'] },
    },
    data: {
      status: 'AVAILABLE',
      orderId: null,
      reservedAt: null,
      redeemedAt: null,
      cancelledAt: null,
    },
  });
  if (restored.count > 0) {
    console.info(JSON.stringify({ event: 'loyalty_reward_restored', storeId: input.storeId }));
  }
  return restored.count;
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
    select: { id: true },
  });
  if (!entitlement) return null;
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
      ? { program: activeProgram, programActive: true, cycle: null, rewards: [] }
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
      select: { id: true, value: true, minimumOrderValue: true, createdAt: true },
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
    cycle: activeProgram ? cycle : null,
    rewards,
  };
}

export async function getCustomerLoyaltySummary(input: {
  tenantId: string;
  storeId: string;
  consumerIdentityId?: string | null;
}) {
  if (!input.consumerIdentityId) return null;
  const consumerIdentityId = input.consumerIdentityId;
  const [cycle, availableRewards] = await Promise.all([
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
  ]);
  return { cycle, availableRewards };
}

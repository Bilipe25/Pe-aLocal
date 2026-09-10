import 'server-only';

import { Prisma } from '@prisma/client';

import type { CustomerRelationshipSegment } from '@/domain/customers/relationship';
import {
  customerReturnCampaignInputSchema,
  type CustomerReturnCampaignInput,
} from '@/schemas/customer-relationship';
import { getDb } from '@/server/database/client';
import {
  AuthorizationError,
  BusinessRuleError,
  NotFoundError,
  ValidationError,
} from '@/server/errors';
import { isTenantAdmin, Permission } from '@/server/permissions';
import { refreshCustomerRelationshipSegments } from '@/server/services/customer-relationship.service';
import { requireActiveStoreContext } from '@/server/services/store-context.service';

const DAY_MS = 24 * 60 * 60 * 1_000;
const RETURN_CAMPAIGN_COOLDOWN_DAYS = 30;
const RETURN_CAMPAIGN_MAX_RECIPIENTS = 250;

async function requireRelationshipContext(permission: Permission) {
  const context = await requireActiveStoreContext(permission);
  if (!isTenantAdmin(context.session.tenantRole)) {
    throw new AuthorizationError('Relacionamento está disponível para proprietários e gerentes.');
  }
  if (
    !context.store.entitlement?.consumerIdentityEnabled ||
    !context.store.entitlement.customerRelationshipEnabled
  ) {
    throw new NotFoundError('Página');
  }
  return context;
}

function targetSegments(target: CustomerReturnCampaignInput['target']) {
  return target === 'COOLING_AND_INACTIVE' ? (['COOLING', 'INACTIVE'] as const) : [target];
}

function campaignRewardSnapshot(input: {
  rewardType: CustomerReturnCampaignInput['rewardType'];
  rewardValue: number | null;
  percentageBasisPoints: number | null;
  maximumDiscountValue: number | null;
  freeProduct: { id: string; name: string; basePrice: number } | null;
}) {
  return {
    rewardType: input.rewardType,
    rewardValue: input.rewardType === 'FIXED_DISCOUNT' ? input.rewardValue : null,
    percentageBasisPoints:
      input.rewardType === 'PERCENT_DISCOUNT' ? input.percentageBasisPoints : null,
    maximumDiscountValue:
      input.rewardType === 'PERCENT_DISCOUNT' ? input.maximumDiscountValue : null,
    freeProductId: input.rewardType === 'FREE_PRODUCT' ? input.freeProduct?.id : null,
    freeProductNameSnapshot: input.rewardType === 'FREE_PRODUCT' ? input.freeProduct?.name : null,
    freeProductBaseValue: input.rewardType === 'FREE_PRODUCT' ? input.freeProduct?.basePrice : null,
  };
}

export async function createCustomerReturnCampaign(rawInput: CustomerReturnCampaignInput) {
  const context = await requireRelationshipContext(Permission.EDIT_STORE_OPERATIONS);
  if (context.session.tenantRole !== 'OWNER') {
    throw new AuthorizationError('Somente o proprietário pode ativar o Volta pra cá.');
  }
  const parsed = customerReturnCampaignInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      'Revise o benefício da campanha.',
      parsed.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
    );
  }
  const tenantId = context.session.tenantId;
  const storeId = context.store.id;
  await refreshCustomerRelationshipSegments({ tenantId, storeId });

  return getDb().$transaction(async (tx) => {
    await tx.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`return-campaign:${storeId}`}, 0))`,
    );
    const entitlement = await tx.storeEntitlement.findFirst({
      where: {
        tenantId,
        storeId,
        consumerIdentityEnabled: true,
        customerRelationshipEnabled: true,
        loyaltyEnabled: true,
      },
      select: { id: true, loyaltyAdvancedRewardsEnabled: true },
    });
    if (!entitlement) {
      throw new BusinessRuleError('Ative a fidelidade da loja antes de usar o Volta pra cá.');
    }
    if (!entitlement.loyaltyAdvancedRewardsEnabled && parsed.data.rewardType !== 'FIXED_DISCOUNT') {
      throw new BusinessRuleError(
        'Desconto percentual e produto grátis exigem Benefícios do seu jeito.',
      );
    }
    const program = await tx.loyaltyProgram.findFirst({
      where: { tenantId, storeId, isActive: true },
      orderBy: [{ version: 'desc' }],
    });
    if (!program) {
      throw new BusinessRuleError('Publique a fidelidade da loja antes de criar uma campanha.');
    }
    const freeProduct =
      parsed.data.rewardType === 'FREE_PRODUCT'
        ? await tx.product.findFirst({
            where: {
              id: parsed.data.freeProductId ?? undefined,
              tenantId,
              storeId,
              archivedAt: null,
              isAvailable: true,
              isSoldOut: false,
              category: { archivedAt: null, isActive: true },
            },
            select: { id: true, name: true, basePrice: true },
          })
        : null;
    if (parsed.data.rewardType === 'FREE_PRODUCT' && !freeProduct) {
      throw new ValidationError('Escolha um produto disponível desta loja.', [
        { field: 'freeProductId', message: 'O produto precisa estar disponível agora.' },
      ]);
    }
    const now = new Date();
    const cooldownSince = new Date(now.getTime() - RETURN_CAMPAIGN_COOLDOWN_DAYS * DAY_MS);
    const audience = await tx.customerRelationshipSnapshot.findMany({
      where: {
        tenantId,
        storeId,
        segment: { in: [...targetSegments(parsed.data.target)] },
        campaignRecipients: { none: { createdAt: { gte: cooldownSince } } },
      },
      orderBy: [{ lastCompletedOrderAt: 'asc' }, { id: 'asc' }],
      take: RETURN_CAMPAIGN_MAX_RECIPIENTS,
      select: {
        id: true,
        customerId: true,
        consumerIdentityId: true,
        consumerIdentity: {
          select: {
            communicationPreferences: {
              where: { tenantId, storeId },
              take: 1,
              select: { storeOffersEnabled: true },
            },
          },
        },
      },
    });
    if (audience.length === 0) {
      throw new BusinessRuleError(
        'Não há clientes elegíveis agora. O intervalo de 30 dias evita repetir incentivos.',
      );
    }
    const reward = campaignRewardSnapshot({ ...parsed.data, freeProduct });
    const endsAt = new Date(now.getTime() + parsed.data.validityDays * DAY_MS);
    const campaign = await tx.customerReturnCampaign.create({
      data: {
        tenantId,
        storeId,
        status: 'ACTIVE',
        target: parsed.data.target,
        ...reward,
        minimumOrderValue: parsed.data.minimumOrderValue,
        validityDays: parsed.data.validityDays,
        cooldownDays: RETURN_CAMPAIGN_COOLDOWN_DAYS,
        audienceSize: audience.length,
        startsAt: now,
        endsAt,
        createdById: context.session.userId,
      },
      select: { id: true },
    });

    let consented = 0;
    for (const recipient of audience) {
      const cycle = await tx.loyaltyCycle.create({
        data: {
          tenantId,
          storeId,
          consumerIdentityId: recipient.consumerIdentityId,
          programId: program.id,
          programVersion: program.version,
          requiredOrders: program.requiredOrders,
          ...reward,
          validityDays: parsed.data.validityDays,
          minimumOrderValue: parsed.data.minimumOrderValue,
          progress: program.requiredOrders,
          status: 'COMPLETED',
          startedAt: now,
          completedAt: now,
        },
      });
      const loyaltyReward = await tx.loyaltyReward.create({
        data: {
          tenantId,
          storeId,
          consumerIdentityId: recipient.consumerIdentityId,
          cycleId: cycle.id,
          rewardType: reward.rewardType,
          value: reward.rewardValue,
          percentageBasisPoints: reward.percentageBasisPoints,
          maximumDiscountValue: reward.maximumDiscountValue,
          freeProductId: reward.freeProductId,
          freeProductNameSnapshot: reward.freeProductNameSnapshot,
          freeProductBaseValue: reward.freeProductBaseValue,
          minimumOrderValue: parsed.data.minimumOrderValue,
          expiresAt: endsAt,
        },
      });
      const marketingConsent =
        recipient.consumerIdentity.communicationPreferences[0]?.storeOffersEnabled === true;
      if (marketingConsent) consented += 1;
      await tx.customerReturnCampaignRecipient.create({
        data: {
          tenantId,
          storeId,
          campaignId: campaign.id,
          snapshotId: recipient.id,
          consumerIdentityId: recipient.consumerIdentityId,
          customerId: recipient.customerId,
          rewardId: loyaltyReward.id,
          marketingConsentAtActivation: marketingConsent,
          notificationStatus: marketingConsent
            ? 'SKIPPED_CHANNEL_UNAVAILABLE'
            : 'SKIPPED_NO_CONSENT',
        },
      });
    }
    console.info(
      JSON.stringify({
        event: 'return_campaign_created',
        storeId,
        recipients: audience.length,
        marketingConsent: consented,
      }),
    );
    return { campaignId: campaign.id, recipients: audience.length, consented };
  });
}

export async function getCustomerReturnCampaignDashboard() {
  const context = await requireRelationshipContext(Permission.VIEW_CUSTOMER_CONTACT);
  const tenantId = context.session.tenantId;
  const storeId = context.store.id;
  await refreshCustomerRelationshipSegments({ tenantId, storeId });
  const now = new Date();
  await getDb().customerReturnCampaign.updateMany({
    where: { tenantId, storeId, status: 'ACTIVE', endsAt: { lte: now } },
    data: { status: 'ENDED' },
  });
  await getDb().customerReturnCampaignRecipient.updateMany({
    where: {
      tenantId,
      storeId,
      status: 'REWARDED',
      reward: { status: 'EXPIRED' },
    },
    data: { status: 'EXPIRED' },
  });
  const [segmentGroups, campaigns, program, products] = await Promise.all([
    getDb().customerRelationshipSnapshot.groupBy({
      by: ['segment'],
      where: { tenantId, storeId, segment: { in: ['COOLING', 'INACTIVE'] } },
      _count: { _all: true },
    }),
    getDb().customerReturnCampaign.findMany({
      where: { tenantId, storeId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 10,
    }),
    context.store.entitlement?.loyaltyEnabled
      ? getDb().loyaltyProgram.findFirst({
          where: { tenantId, storeId, isActive: true },
          orderBy: [{ version: 'desc' }],
          select: { id: true },
        })
      : null,
    context.store.entitlement?.loyaltyAdvancedRewardsEnabled
      ? getDb().product.findMany({
          where: {
            tenantId,
            storeId,
            archivedAt: null,
            isAvailable: true,
            isSoldOut: false,
            category: { archivedAt: null, isActive: true },
          },
          orderBy: [{ name: 'asc' }, { id: 'asc' }],
          select: { id: true, name: true, basePrice: true },
        })
      : [],
  ]);
  const campaignIds = campaigns.map((campaign) => campaign.id);
  const [recipientGroups, notificationGroups, orderGroups, usedOrderGroups, recipientRewards] =
    campaignIds.length
      ? await Promise.all([
          getDb().customerReturnCampaignRecipient.groupBy({
            by: ['campaignId', 'status'],
            where: { tenantId, storeId, campaignId: { in: campaignIds } },
            _count: { _all: true },
          }),
          getDb().customerReturnCampaignRecipient.groupBy({
            by: ['campaignId', 'notificationStatus'],
            where: { tenantId, storeId, campaignId: { in: campaignIds } },
            _count: { _all: true },
          }),
          getDb().customerReturnCampaignOrder.groupBy({
            by: ['campaignId'],
            where: { tenantId, storeId, campaignId: { in: campaignIds } },
            _count: { _all: true },
            _sum: { orderValue: true },
          }),
          getDb().customerReturnCampaignOrder.groupBy({
            by: ['campaignId'],
            where: { tenantId, storeId, campaignId: { in: campaignIds }, usedReward: true },
            _count: { _all: true },
          }),
          getDb().customerReturnCampaignRecipient.findMany({
            where: { tenantId, storeId, campaignId: { in: campaignIds } },
            select: { campaignId: true, rewardId: true },
          }),
        ])
      : [[], [], [], [], []];
  const rewardToCampaign = new Map(
    recipientRewards.map((recipient) => [recipient.rewardId, recipient.campaignId]),
  );
  const benefitGroups = recipientRewards.length
    ? await getDb().orderPriceAdjustment.groupBy({
        by: ['sourceIdSnapshot'],
        where: {
          tenantId,
          storeId,
          adjustmentType: 'LOYALTY',
          sourceIdSnapshot: { in: recipientRewards.map((recipient) => recipient.rewardId) },
        },
        _sum: { amount: true },
      })
    : [];
  const benefitByCampaign = new Map<string, number>();
  for (const group of benefitGroups) {
    if (!group.sourceIdSnapshot) continue;
    const campaignId = rewardToCampaign.get(group.sourceIdSnapshot);
    if (!campaignId) continue;
    benefitByCampaign.set(
      campaignId,
      (benefitByCampaign.get(campaignId) ?? 0) + (group._sum?.amount ?? 0),
    );
  }
  const audience = Object.fromEntries(
    segmentGroups.map((group) => [group.segment, group._count._all]),
  ) as Partial<Record<CustomerRelationshipSegment, number>>;
  return {
    store: { id: storeId, name: context.store.name },
    audience: {
      cooling: audience.COOLING ?? 0,
      inactive: audience.INACTIVE ?? 0,
      total: (audience.COOLING ?? 0) + (audience.INACTIVE ?? 0),
    },
    canCreate: context.session.tenantRole === 'OWNER' && Boolean(program),
    advancedEnabled: Boolean(context.store.entitlement?.loyaltyAdvancedRewardsEnabled),
    products,
    campaigns: campaigns.map((campaign) => {
      const statuses = recipientGroups.filter((group) => group.campaignId === campaign.id);
      const returned = statuses.reduce(
        (sum, group) =>
          sum +
          (group.status === 'RETURNED' || group.status === 'CONVERTED' ? group._count._all : 0),
        0,
      );
      const orderMetrics = orderGroups.find((group) => group.campaignId === campaign.id);
      const invited = notificationGroups.reduce(
        (sum, group) =>
          sum +
          (group.campaignId === campaign.id && group.notificationStatus === 'SENT'
            ? group._count._all
            : 0),
        0,
      );
      return {
        ...campaign,
        metrics: {
          selected: campaign.audienceSize,
          invited,
          returned,
          orders: orderMetrics?._count._all ?? 0,
          orderValue: orderMetrics?._sum.orderValue ?? 0,
          rewardsUsed:
            usedOrderGroups.find((group) => group.campaignId === campaign.id)?._count._all ?? 0,
          benefitValueUsed: benefitByCampaign.get(campaign.id) ?? 0,
        },
      };
    }),
  };
}

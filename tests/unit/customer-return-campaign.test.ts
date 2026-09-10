import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  db: {} as Record<string, unknown>,
  refresh: vi.fn(),
  requireContext: vi.fn(),
}));

vi.mock('@/server/database/client', () => ({ getDb: () => mocks.db }));
vi.mock('@/server/services/customer-relationship.service', () => ({
  refreshCustomerRelationshipSegments: mocks.refresh,
}));
vi.mock('@/server/services/store-context.service', () => ({
  requireActiveStoreContext: mocks.requireContext,
}));

import { createCustomerReturnCampaign } from '@/server/services/customer-return-campaign.service';

const campaignInput = {
  target: 'INACTIVE' as const,
  rewardType: 'FIXED_DISCOUNT' as const,
  rewardValue: 500,
  percentageBasisPoints: null,
  maximumDiscountValue: null,
  freeProductId: null,
  minimumOrderValue: 3_500,
  validityDays: 7 as const,
};

function transaction() {
  return {
    $executeRaw: vi.fn().mockResolvedValue(0),
    storeEntitlement: {
      findFirst: vi.fn().mockResolvedValue({
        id: 'entitlement-a',
        loyaltyAdvancedRewardsEnabled: false,
      }),
    },
    loyaltyProgram: {
      findFirst: vi.fn().mockResolvedValue({ id: 'program-a', version: 3, requiredOrders: 5 }),
    },
    product: { findFirst: vi.fn() },
    customerRelationshipSnapshot: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: 'snapshot-a',
          customerId: 'customer-a',
          consumerIdentityId: 'identity-a',
          consumerIdentity: { communicationPreferences: [] },
        },
      ]),
    },
    customerReturnCampaign: {
      create: vi.fn().mockResolvedValue({ id: 'campaign-a' }),
    },
    loyaltyCycle: {
      create: vi.fn().mockResolvedValue({ id: 'cycle-a' }),
    },
    loyaltyReward: {
      create: vi.fn().mockResolvedValue({ id: 'reward-a' }),
    },
    customerReturnCampaignRecipient: {
      create: vi.fn().mockResolvedValue({ id: 'recipient-a' }),
    },
  };
}

describe('manual Volta pra cá campaign', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.refresh.mockResolvedValue(0);
    mocks.requireContext.mockResolvedValue({
      session: { tenantId: 'tenant-a', tenantRole: 'OWNER', userId: 'user-a' },
      store: {
        id: 'store-a',
        entitlement: {
          consumerIdentityEnabled: true,
          customerRelationshipEnabled: true,
          loyaltyEnabled: true,
        },
      },
    });
  });

  it('cria uma reward única para o público INACTIVE e não envia sem consentimento', async () => {
    const tx = transaction();
    mocks.db = { $transaction: vi.fn((operation) => operation(tx)) };

    await expect(createCustomerReturnCampaign(campaignInput)).resolves.toEqual({
      campaignId: 'campaign-a',
      recipients: 1,
      consented: 0,
    });
    expect(tx.customerRelationshipSnapshot.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-a',
          storeId: 'store-a',
          segment: { in: ['INACTIVE'] },
          campaignRecipients: { none: { createdAt: { gte: expect.any(Date) } } },
        }),
      }),
    );
    expect(tx.loyaltyReward.create).toHaveBeenCalledOnce();
    expect(tx.customerReturnCampaignRecipient.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant-a',
        storeId: 'store-a',
        campaignId: 'campaign-a',
        rewardId: 'reward-a',
        marketingConsentAtActivation: false,
        notificationStatus: 'SKIPPED_NO_CONSENT',
      }),
    });
  });

  it('respeita o cooldown em retry e não cria uma segunda reward', async () => {
    const tx = transaction();
    tx.customerRelationshipSnapshot.findMany
      .mockResolvedValueOnce([
        {
          id: 'snapshot-a',
          customerId: 'customer-a',
          consumerIdentityId: 'identity-a',
          consumerIdentity: { communicationPreferences: [] },
        },
      ])
      .mockResolvedValueOnce([]);
    mocks.db = { $transaction: vi.fn((operation) => operation(tx)) };

    await createCustomerReturnCampaign(campaignInput);
    await expect(createCustomerReturnCampaign(campaignInput)).rejects.toThrow(
      'O intervalo de 30 dias evita repetir incentivos.',
    );
    expect(tx.loyaltyReward.create).toHaveBeenCalledOnce();
    expect(tx.customerReturnCampaignRecipient.create).toHaveBeenCalledOnce();
  });
});

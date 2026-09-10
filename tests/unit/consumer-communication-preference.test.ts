import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireConsumerForStore: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock('@/server/services/consumer-auth.service', () => ({
  requireConsumerForStore: mocks.requireConsumerForStore,
}));
vi.mock('@/server/database/client', () => ({
  getDb: () => ({ consumerCommunicationPreference: { upsert: mocks.upsert } }),
}));

import { updateConsumerCommunicationPreference } from '@/server/services/consumer-communication-preference.service';

describe('consumer communication preferences', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireConsumerForStore.mockResolvedValue({
      scope: {
        id: 'store-a',
        tenantId: 'tenant-a',
        name: 'Loja A',
        slug: 'loja-a',
        entitlement: { consumerIdentityEnabled: true, customerRelationshipEnabled: true },
      },
      consumer: { identityId: 'identity-a' },
    });
    mocks.upsert.mockImplementation(({ update }) => Promise.resolve(update));
  });

  it('registra unsubscribe de ofertas da loja sem desativar mensagens funcionais', async () => {
    await updateConsumerCommunicationPreference({
      storeSlug: 'loja-a',
      sessionToken: 'session-a',
      preference: {
        benefitEarnedEnabled: true,
        benefitExpiringEnabled: true,
        storeOffersEnabled: false,
      },
    });

    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId_storeId_consumerIdentityId: {
            tenantId: 'tenant-a',
            storeId: 'store-a',
            consumerIdentityId: 'identity-a',
          },
        },
        update: expect.objectContaining({
          benefitEarnedEnabled: true,
          benefitExpiringEnabled: true,
          storeOffersEnabled: false,
          storeOffersConsentedAt: null,
          storeOffersUnsubscribedAt: expect.any(Date),
        }),
      }),
    );
  });

  it('registra opt-in explícito para ofertas por Store', async () => {
    await updateConsumerCommunicationPreference({
      storeSlug: 'loja-a',
      preference: {
        benefitEarnedEnabled: false,
        benefitExpiringEnabled: false,
        storeOffersEnabled: true,
      },
    });

    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          storeOffersEnabled: true,
          storeOffersConsentedAt: expect.any(Date),
          storeOffersUnsubscribedAt: null,
        }),
      }),
    );
  });

  it('não expõe preferências quando a capability da loja está desligada', async () => {
    mocks.requireConsumerForStore.mockResolvedValueOnce({
      scope: {
        id: 'store-a',
        tenantId: 'tenant-a',
        entitlement: { consumerIdentityEnabled: true, customerRelationshipEnabled: false },
      },
      consumer: { identityId: 'identity-a' },
    });

    await expect(
      updateConsumerCommunicationPreference({
        storeSlug: 'loja-a',
        preference: {
          benefitEarnedEnabled: true,
          benefitExpiringEnabled: true,
          storeOffersEnabled: false,
        },
      }),
    ).rejects.toThrow('Página não encontrado');
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});

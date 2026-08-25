import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getDb: vi.fn(), requireConsumerForStore: vi.fn() }));

vi.mock('@/server/database/client', () => ({ getDb: mocks.getDb }));
vi.mock('@/server/services/consumer-auth.service', () => ({
  requireConsumerForStore: mocks.requireConsumerForStore,
}));

import {
  listConsumerSessions,
  revokeConsumerSession,
  revokeOtherConsumerSessions,
} from '@/server/services/consumer-session.service';

describe('consumer session management', () => {
  const findMany = vi.fn();
  const updateMany = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireConsumerForStore.mockResolvedValue({
      scope: { entitlement: { consumerConvenienceV2Enabled: true } },
      consumer: { identityId: 'identity-1', sessionId: 'session-current' },
    });
    mocks.getDb.mockReturnValue({ consumerSession: { findMany, updateMany } });
  });

  it('lists only active sessions from the authenticated identity and marks the current one', async () => {
    findMany.mockResolvedValue([
      {
        id: 'session-current',
        deviceLabel: 'Chrome no Windows',
        lastUsedAt: new Date(),
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
      },
    ]);

    await expect(listConsumerSessions({ storeSlug: 'loja' })).resolves.toMatchObject({
      sessions: [{ id: 'session-current', current: true }],
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          consumerIdentityId: 'identity-1',
          revokedAt: null,
          expiresAt: { gt: expect.any(Date) },
        }),
        take: 5,
      }),
    );
  });

  it('revokes other sessions while preserving the current one', async () => {
    updateMany.mockResolvedValue({ count: 2 });

    await expect(revokeOtherConsumerSessions({ storeSlug: 'loja' })).resolves.toEqual({
      success: true,
      revokedCount: 2,
    });
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        consumerIdentityId: 'identity-1',
        id: { not: 'session-current' },
        revokedAt: null,
      },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it('does not let the sessions endpoint revoke the current session', async () => {
    await expect(
      revokeConsumerSession({ storeSlug: 'loja', sessionId: 'session-current' }),
    ).rejects.toThrow('Use “Sair”');
    expect(updateMany).not.toHaveBeenCalled();
  });
});

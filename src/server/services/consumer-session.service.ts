import 'server-only';

import { getDb } from '@/server/database/client';
import { BusinessRuleError, NotFoundError } from '@/server/errors';
import { requireConsumerForStore } from '@/server/services/consumer-auth.service';

async function requireSessionManagement(input: {
  storeSlug: string;
  sessionToken?: string | null;
}) {
  const authorized = await requireConsumerForStore(input);
  if (!authorized.scope.entitlement?.consumerConvenienceV2Enabled) {
    throw new NotFoundError('Página');
  }
  return authorized;
}

export async function listConsumerSessions(input: {
  storeSlug: string;
  sessionToken?: string | null;
}) {
  const { consumer } = await requireSessionManagement(input);
  const now = new Date();
  const sessions = await getDb().consumerSession.findMany({
    where: {
      consumerIdentityId: consumer.identityId,
      revokedAt: null,
      expiresAt: { gt: now },
    },
    orderBy: [{ lastUsedAt: 'desc' }, { createdAt: 'desc' }],
    take: 5,
    select: {
      id: true,
      deviceLabel: true,
      lastUsedAt: true,
      createdAt: true,
      expiresAt: true,
    },
  });
  return {
    sessions: sessions.map((session) => ({
      ...session,
      current: session.id === consumer.sessionId,
    })),
  };
}

export async function revokeConsumerSession(input: {
  storeSlug: string;
  sessionToken?: string | null;
  sessionId: string;
}) {
  const { consumer } = await requireSessionManagement(input);
  if (input.sessionId === consumer.sessionId) {
    throw new BusinessRuleError('Use “Sair” para encerrar este aparelho.');
  }
  await getDb().consumerSession.updateMany({
    where: {
      id: input.sessionId,
      consumerIdentityId: consumer.identityId,
      revokedAt: null,
    },
    data: { revokedAt: new Date() },
  });
  return { success: true };
}

export async function revokeOtherConsumerSessions(input: {
  storeSlug: string;
  sessionToken?: string | null;
}) {
  const { consumer } = await requireSessionManagement(input);
  const result = await getDb().consumerSession.updateMany({
    where: {
      consumerIdentityId: consumer.identityId,
      id: { not: consumer.sessionId },
      revokedAt: null,
    },
    data: { revokedAt: new Date() },
  });
  return { success: true, revokedCount: result.count };
}

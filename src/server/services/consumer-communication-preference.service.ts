import 'server-only';

import type { ConsumerCommunicationPreferenceInput } from '@/schemas/customer-relationship';
import { consumerCommunicationPreferenceInputSchema } from '@/schemas/customer-relationship';
import { getDb } from '@/server/database/client';
import { NotFoundError, ValidationError } from '@/server/errors';
import { requireConsumerForStore } from '@/server/services/consumer-auth.service';

async function requireCommunicationScope(input: {
  storeSlug: string;
  sessionToken?: string | null;
}) {
  const result = await requireConsumerForStore(input);
  if (
    !result.scope.entitlement?.consumerIdentityEnabled ||
    !result.scope.entitlement.customerRelationshipEnabled
  ) {
    throw new NotFoundError('Página');
  }
  return result;
}

export async function getConsumerCommunicationPreference(input: {
  storeSlug: string;
  sessionToken?: string | null;
}) {
  const { scope, consumer } = await requireCommunicationScope(input);
  const preference = await getDb().consumerCommunicationPreference.upsert({
    where: {
      tenantId_storeId_consumerIdentityId: {
        tenantId: scope.tenantId,
        storeId: scope.id,
        consumerIdentityId: consumer.identityId,
      },
    },
    create: {
      tenantId: scope.tenantId,
      storeId: scope.id,
      consumerIdentityId: consumer.identityId,
    },
    update: {},
    select: {
      benefitEarnedEnabled: true,
      benefitExpiringEnabled: true,
      storeOffersEnabled: true,
    },
  });
  return { store: { id: scope.id, name: scope.name, slug: scope.slug }, preference };
}

export async function updateConsumerCommunicationPreference(input: {
  storeSlug: string;
  sessionToken?: string | null;
  preference: ConsumerCommunicationPreferenceInput;
}) {
  const parsed = consumerCommunicationPreferenceInputSchema.safeParse(input.preference);
  if (!parsed.success) throw new ValidationError('Revise suas escolhas de comunicação.');
  const { scope, consumer } = await requireCommunicationScope(input);
  const now = new Date();
  return getDb().consumerCommunicationPreference.upsert({
    where: {
      tenantId_storeId_consumerIdentityId: {
        tenantId: scope.tenantId,
        storeId: scope.id,
        consumerIdentityId: consumer.identityId,
      },
    },
    create: {
      tenantId: scope.tenantId,
      storeId: scope.id,
      consumerIdentityId: consumer.identityId,
      ...parsed.data,
      storeOffersConsentedAt: parsed.data.storeOffersEnabled ? now : null,
      storeOffersUnsubscribedAt: parsed.data.storeOffersEnabled ? null : now,
    },
    update: {
      ...parsed.data,
      storeOffersConsentedAt: parsed.data.storeOffersEnabled ? now : null,
      storeOffersUnsubscribedAt: parsed.data.storeOffersEnabled ? null : now,
    },
    select: {
      benefitEarnedEnabled: true,
      benefitExpiringEnabled: true,
      storeOffersEnabled: true,
    },
  });
}

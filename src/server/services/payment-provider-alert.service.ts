import 'server-only';

import type { Prisma, PrismaClient } from '@prisma/client';

import { getDb } from '@/server/database/client';

type AlertClient = PrismaClient | Prisma.TransactionClient;

export interface PaymentProviderAlertInput {
  code: string;
  priority: 'HIGH' | 'CRITICAL';
  tenantId?: string | null;
  storeId?: string | null;
  orderId?: string | null;
  paymentId?: string | null;
  mercadoPagoPaymentId?: string | null;
}

export interface RecoveredPaymentProviderAlertInput {
  tenantId: string;
  storeId: string;
  recoveredAt?: Date;
}

function sanitizeCode(code: string) {
  return (
    code
      .toUpperCase()
      .replace(/[^A-Z0-9_:-]/g, '_')
      .slice(0, 64) || 'UNKNOWN'
  );
}

export async function recordPaymentProviderAlert(
  input: PaymentProviderAlertInput,
  client: AlertClient = getDb(),
) {
  const code = sanitizeCode(input.code);
  const scope =
    input.mercadoPagoPaymentId ?? input.paymentId ?? input.orderId ?? input.storeId ?? 'global';
  const dedupeKey = `${code}:${scope}`.slice(0, 200);
  const now = new Date();

  return client.paymentProviderAlert.upsert({
    where: { provider_dedupeKey: { provider: 'MERCADO_PAGO', dedupeKey } },
    create: {
      provider: 'MERCADO_PAGO',
      dedupeKey,
      priority: input.priority,
      tenantId: input.tenantId ?? null,
      storeId: input.storeId ?? null,
      orderId: input.orderId ?? null,
      paymentId: input.paymentId ?? null,
      mercadoPagoPaymentId: input.mercadoPagoPaymentId ?? null,
      code,
      firstOccurredAt: now,
      lastOccurredAt: now,
    },
    update: {
      priority: input.priority,
      status: 'OPEN',
      occurrenceCount: { increment: 1 },
      lastOccurredAt: now,
      resolvedAt: null,
    },
  });
}

export async function resolveRecoveredPaymentProviderCreationAlerts(
  input: RecoveredPaymentProviderAlertInput,
  client: AlertClient = getDb(),
) {
  const recoveredAt = input.recoveredAt ?? new Date();
  return client.paymentProviderAlert.updateMany({
    where: {
      provider: 'MERCADO_PAGO',
      tenantId: input.tenantId,
      storeId: input.storeId,
      status: 'OPEN',
      code: { startsWith: 'ORDER_CREATE_' },
      lastOccurredAt: { lte: recoveredAt },
    },
    data: { status: 'RESOLVED', resolvedAt: recoveredAt },
  });
}

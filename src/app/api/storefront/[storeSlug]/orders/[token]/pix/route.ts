import { NextResponse } from 'next/server';

import { triggerNewOrder, triggerPaymentUpdated } from '@/lib/pusher/server';
import { getDb } from '@/server/database/client';
import { getRateLimiter, RATE_LIMITS } from '@/server/rate-limit';
import { isDeployedRuntime } from '@/server/runtime-environment';
import { dispatchCommittedOrderEvents } from '@/server/services/order-event-dispatch.service';
import {
  ensureMercadoPagoPixCreated,
  getMercadoPagoPaymentPresentation,
} from '@/server/services/mercado-pago-payment.service';

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ storeSlug: string; token: string }> },
) {
  const { storeSlug, token } = await context.params;
  const limit = await getRateLimiter().check({
    identifier: `provider-payment-resume:${await sha256Hex(token)}`,
    ...RATE_LIMITS.resumeProviderPayment,
    strict: isDeployedRuntime(),
  });
  if (!limit.allowed || limit.unavailable) {
    return NextResponse.json(
      { error: 'Tente novamente em instantes.' },
      { status: 429, headers: { 'Cache-Control': 'private, no-store' } },
    );
  }

  const order = await getDb().order.findFirst({
    where: {
      publicToken: token,
      publicTokenExpiresAt: { gt: new Date() },
      store: { slug: storeSlug },
      payment: { provider: 'MERCADO_PAGO' },
    },
    select: {
      id: true,
      paymentStatus: true,
      mercadoPagoPayment: { select: { id: true } },
    },
  });
  if (!order?.mercadoPagoPayment) {
    return NextResponse.json(
      { error: 'Pagamento não encontrado.' },
      { status: 404, headers: { 'Cache-Control': 'private, no-store' } },
    );
  }

  try {
    const sync = await ensureMercadoPagoPixCreated(order.mercadoPagoPayment.id);
    if (sync?.eventIds.length) {
      await dispatchCommittedOrderEvents({
        eventIds: sync.eventIds,
        publishDirect: async () => {
          await triggerPaymentUpdated(sync.storeId, sync.orderId, sync.paymentStatus);
          if (sync.becameActionable) {
            await triggerNewOrder(sync.storeId, sync.orderId, sync.orderNumber);
          }
        },
      });
    }
    const presentation = await getMercadoPagoPaymentPresentation(order.id);
    return NextResponse.json(
      {
        paymentStatus: sync?.paymentStatus ?? order.paymentStatus,
        payment: presentation
          ? {
              ...presentation,
              expiresAt: presentation.expiresAt?.toISOString() ?? null,
            }
          : null,
      },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch {
    return NextResponse.json(
      { error: 'Não foi possível gerar o Pix agora.' },
      { status: 502, headers: { 'Cache-Control': 'private, no-store' } },
    );
  }
}

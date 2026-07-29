'use server';

import { headers } from 'next/headers';

import type { EffectiveStoreAvailabilityState } from '@/features/stores/availability';
import { normalizePhone } from '@/lib/brazil';
import { triggerNewOrder, triggerPaymentUpdated } from '@/lib/pusher/server';
import { checkoutSchema } from '@/schemas/checkout';
import { getDb } from '@/server/database/client';
import {
  actionError,
  actionSuccess,
  BusinessRuleError,
  CheckoutError,
  DomainError,
  RateLimitError,
  ValidationError,
  type ActionResult,
} from '@/server/errors';
import { getRateLimiter, RATE_LIMITS } from '@/server/rate-limit';
import { createOrder } from '@/server/repositories/order.repository';
import { getEffectiveStoreAvailabilityForTenant } from '@/server/services/store-availability.service';
import { dispatchCommittedOrderEvents } from '@/server/services/order-event-dispatch.service';
import { createOrderFingerprint } from '@/server/services/order-idempotency.service';
import { reportCustomerPixPayment } from '@/server/services/order-payment.service';
import { getRecognitionCookieName } from '@/server/services/customer-recognition.service';

import { reportPixPaymentInputSchema } from './schemas';

interface CreateOrderData {
  publicToken: string;
  orderNumber: number;
  paymentReportToken: string | null;
}

interface ReportPixPaymentData {
  paymentStatus: 'CUSTOMER_REPORTED_PAID' | 'PAID';
  version: number;
  notificationPending: boolean;
}

interface CheckoutAvailabilityData {
  acceptingOrders: boolean;
  state: EffectiveStoreAvailabilityState;
  reason: string;
  nextTransitionAt: string | null;
}

/**
 * Preflight público para atualizar a UX do checkout. A cotação e a criação
 * repetem esta validação e continuam sendo as fontes autoritativas.
 */
export async function getCheckoutAvailabilityAction(
  storeSlug: string,
): Promise<ActionResult<CheckoutAvailabilityData>> {
  try {
    const store = await getDb().store.findUnique({
      where: { slug: storeSlug },
      select: { id: true, tenantId: true },
    });
    if (!store) throw new BusinessRuleError('Loja não encontrada');

    const availability = await getEffectiveStoreAvailabilityForTenant(store.tenantId, store.id);
    return actionSuccess({
      acceptingOrders: availability.acceptingOrders,
      state: availability.state,
      reason: availability.reason,
      nextTransitionAt: availability.nextTransitionAt?.toISOString() ?? null,
    });
  } catch (error) {
    return actionError(error);
  }
}

async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function getClientAddress(requestHeaders: Headers) {
  const forwardedFor =
    requestHeaders.get('cf-connecting-ip') ?? requestHeaders.get('x-forwarded-for');
  return forwardedFor?.split(',')[0]?.trim() || 'unknown';
}

function isDeployedEnvironment() {
  return process.env.APP_ENV === 'staging' || process.env.APP_ENV === 'production';
}

function readCookie(requestHeaders: Headers, name: string) {
  const value = requestHeaders
    .get('cookie')
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
  return value || null;
}

export async function reportPixPaymentAction(
  rawInput: unknown,
): Promise<ActionResult<ReportPixPaymentData>> {
  try {
    const parsed = reportPixPaymentInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new ValidationError('O código para informar o pagamento é inválido.');
    }
    const requestHeaders = await headers();
    const clientAddress = getClientAddress(requestHeaders);
    const limiter = getRateLimiter();
    const ipRateLimit = await limiter.check({
      identifier: `report-payment:ip:${clientAddress}`,
      ...RATE_LIMITS.reportPayment,
      strict: true,
    });
    const tokenRateLimit = await limiter.check({
      identifier: `report-payment:${await sha256Hex(parsed.data.reportToken)}`,
      ...RATE_LIMITS.reportPayment,
      strict: true,
    });
    if (ipRateLimit.unavailable || tokenRateLimit.unavailable) {
      throw new RateLimitError('Não foi possível validar esta solicitação agora. Tente novamente.');
    }
    if (!ipRateLimit.allowed || !tokenRateLimit.allowed) {
      throw new RateLimitError(
        'Muitas tentativas. Aguarde antes de informar o pagamento novamente.',
      );
    }

    const result = await reportCustomerPixPayment(parsed.data.reportToken);
    const dispatch = await dispatchCommittedOrderEvents({
      eventIds: result.outboxEventIds,
      publishDirect: async () => {
        await triggerPaymentUpdated(result.storeId, result.orderId, result.paymentStatus);
      },
    });
    return actionSuccess({
      paymentStatus: result.paymentStatus as ReportPixPaymentData['paymentStatus'],
      version: result.version,
      notificationPending: dispatch.notificationPending,
    });
  } catch (error) {
    return actionError(error);
  }
}

/**
 * Cria o pedido somente depois de uma nova cotação autoritativa dentro da
 * mesma transação serializável. Nenhum preço, zona ou cupom do navegador é
 * aceito como fonte de verdade.
 */
export async function createOrderAction(
  storeSlug: string,
  rawInput: unknown,
): Promise<ActionResult<CreateOrderData>> {
  const startedAt = performance.now();
  const correlationId = crypto.randomUUID();

  try {
    const parsed = checkoutSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new CheckoutError(
        'CART_INVALID',
        'Dados do checkout inválidos',
        400,
        parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      );
    }

    const input = parsed.data;
    const requestHeaders = await headers();
    const clientAddress = getClientAddress(requestHeaders);
    const strict = isDeployedEnvironment();
    const limiter = getRateLimiter();
    const phoneHash = await sha256Hex(normalizePhone(input.customerPhone));
    const [ipRateLimit, phoneRateLimit] = await Promise.all([
      limiter.check({
        identifier: `order-ip:${storeSlug}:${clientAddress}`,
        ...RATE_LIMITS.createOrderByIp,
        strict,
      }),
      limiter.check({
        identifier: `order:${storeSlug}:${phoneHash}`,
        ...RATE_LIMITS.createOrder,
        strict,
      }),
    ]);

    if (ipRateLimit.unavailable || phoneRateLimit.unavailable) {
      throw new RateLimitError(
        'Não foi possível validar esta solicitação agora. Tente novamente em instantes.',
      );
    }
    if (!ipRateLimit.allowed || !phoneRateLimit.allowed) {
      throw new RateLimitError('Muitos pedidos em sequência. Aguarde um minuto.');
    }

    const order = await createOrder({
      input,
      storeSlug,
      idempotencyFingerprint: createOrderFingerprint(input),
      recognitionBrowserToken: readCookie(requestHeaders, getRecognitionCookieName()),
    });

    if (order.created) {
      await dispatchCommittedOrderEvents({
        eventIds: order.outboxEventIds,
        publishDirect: async () => {
          await triggerNewOrder(order.storeId, order.id, order.orderNumber);
        },
      });
    }

    console.info('[CHECKOUT_ORDER_CREATED]', {
      correlationId,
      storeId: order.storeId,
      orderNumber: order.orderNumber,
      created: order.created,
      customerNameConflict: Boolean(order.customerNameConflict),
      durationMs: Math.round(performance.now() - startedAt),
    });

    return actionSuccess({
      publicToken: order.publicToken,
      orderNumber: order.orderNumber,
      paymentReportToken: input.paymentMethod === 'PIX' ? order.paymentReportToken : null,
    });
  } catch (error) {
    console.warn('[CHECKOUT_ORDER_REJECTED]', {
      correlationId,
      code: error instanceof DomainError ? error.code : 'INTERNAL_ERROR',
      durationMs: Math.round(performance.now() - startedAt),
    });
    return actionError(error);
  }
}

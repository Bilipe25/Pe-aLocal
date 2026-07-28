import 'server-only';

import { Prisma } from '@prisma/client';

import { normalizePhone, validatePixKey } from '@/lib/brazil';
import type { CheckoutInput } from '@/schemas/checkout';
import { getDb } from '@/server/database/client';
import {
  CheckoutError,
  NotFoundError,
  OrderPaymentConsistencyError,
  QuoteChangedError,
} from '@/server/errors';
import {
  calculateCheckoutQuote,
  toPublicCheckoutQuote,
} from '@/server/services/checkout-quote.service';
import * as orderAudit from '@/server/services/order-audit.service';
import { assertMatchingOrderFingerprint } from '@/server/services/order-idempotency.service';
import { appendOrderOutboxEvent } from '@/server/services/order-outbox.service';

interface CreateOrderParams {
  input: CheckoutInput;
  storeSlug: string;
  idempotencyFingerprint: string;
}

interface CreateOrderResult {
  id: string;
  storeId: string;
  publicToken: string;
  orderNumber: number;
  paymentReportToken: string;
  created: boolean;
  outboxEventIds: string[];
}

function formatDeliveryAddress(address: NonNullable<CheckoutInput['deliveryAddress']>) {
  return [
    `${address.street}, ${address.number}`,
    address.complement,
    address.neighborhood,
    `${address.city} - ${address.state}`,
    `CEP ${address.postalCode.replace(/^(\d{5})(\d{3})$/, '$1-$2')}`,
  ]
    .filter(Boolean)
    .join(', ');
}

/**
 * Revalida a cotação e cria o pedido na mesma transação serializável.
 * Nenhum preço, zona, cupom ou disponibilidade enviado pelo navegador é
 * tratado como fonte de verdade.
 */
async function createOrderOnce(params: CreateOrderParams): Promise<CreateOrderResult> {
  const { input, storeSlug, idempotencyFingerprint } = params;

  return getDb().$transaction(
    async (tx) => {
      const store = await tx.store.findUnique({
        where: { slug: storeSlug },
        select: {
          id: true,
          tenantId: true,
          settings: {
            select: {
              acceptsPix: true,
              pixKeyType: true,
              pixKey: true,
              acceptsCash: true,
              acceptsCardOnDelivery: true,
            },
          },
        },
      });
      if (!store) throw new NotFoundError('Loja');

      const idempotencyLockKey = `${store.id}:${input.idempotencyKey}`;
      await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(hashtextextended(${idempotencyLockKey}, 0))
      `;

      const existing = await tx.order.findUnique({
        where: {
          storeId_idempotencyKey: {
            storeId: store.id,
            idempotencyKey: input.idempotencyKey,
          },
        },
        select: {
          id: true,
          publicToken: true,
          orderNumber: true,
          paymentReportToken: true,
          idempotencyFingerprint: true,
        },
      });
      if (existing) {
        assertMatchingOrderFingerprint(existing.idempotencyFingerprint, idempotencyFingerprint);
        return {
          id: existing.id,
          storeId: store.id,
          publicToken: existing.publicToken,
          orderNumber: existing.orderNumber,
          paymentReportToken: existing.paymentReportToken,
          created: false,
          outboxEventIds: [],
        };
      }

      const quote = await calculateCheckoutQuote(storeSlug, input, { client: tx });
      if (!quote) throw new NotFoundError('Loja');
      const publicQuote = toPublicCheckoutQuote(quote);

      if (quote.quoteFingerprint !== input.expectedQuoteFingerprint) {
        throw new QuoteChangedError(publicQuote as unknown as Record<string, unknown>);
      }
      if (!quote.canCheckout) {
        const issue = quote.issues[0];
        const code =
          issue?.code === 'PRODUCT_UNAVAILABLE'
            ? 'PRODUCT_UNAVAILABLE'
            : issue?.code === 'OUTSIDE_DELIVERY_AREA'
              ? 'OUTSIDE_DELIVERY_AREA'
              : issue?.code === 'COUPON_INVALID'
                ? 'COUPON_INVALID'
                : issue?.code === 'STORE_UNAVAILABLE'
                  ? 'STORE_UNAVAILABLE'
                  : 'CART_INVALID';
        throw new CheckoutError(
          code,
          issue?.message ?? 'Revise o carrinho antes de confirmar o pedido.',
          code === 'STORE_UNAVAILABLE' ? 409 : 422,
          [{ quote: publicQuote }],
        );
      }

      const settings = store.settings;
      if (!settings) {
        throw new CheckoutError(
          'STORE_UNAVAILABLE',
          'A loja ainda não configurou as opções de pedido.',
          409,
        );
      }
      if (input.paymentMethod === 'PIX') {
        if (
          !settings.acceptsPix ||
          !settings.pixKeyType ||
          !settings.pixKey ||
          !validatePixKey(settings.pixKeyType, settings.pixKey)
        ) {
          throw new CheckoutError(
            'STORE_UNAVAILABLE',
            'O Pix está temporariamente indisponível. Escolha outra forma de pagamento.',
            409,
          );
        }
      } else if (input.paymentMethod === 'CASH' && !settings.acceptsCash) {
        throw new CheckoutError(
          'STORE_UNAVAILABLE',
          'O pagamento em dinheiro não está disponível.',
          409,
        );
      } else if (input.paymentMethod === 'CARD_ON_DELIVERY' && !settings.acceptsCardOnDelivery) {
        throw new CheckoutError(
          'STORE_UNAVAILABLE',
          'O cartão na entrega não está disponível.',
          409,
        );
      }
      if (
        input.paymentMethod === 'CASH' &&
        input.changeFor != null &&
        input.changeFor < quote.total
      ) {
        throw new CheckoutError(
          'CART_INVALID',
          'O valor para troco precisa ser igual ou maior que o total.',
        );
      }

      // Acquire the popular-coupon lock only after catalog, availability,
      // delivery and payment validation. Serializable retry gives the next
      // attempt a fresh quote if another order consumed the final usage.
      if (quote.couponId && input.couponCode) {
        await tx.$queryRaw`
          SELECT "id"
          FROM "coupons"
          WHERE "id" = ${quote.couponId}
            AND "tenantId" = ${store.tenantId}
            AND "storeId" = ${store.id}
            AND "code" = ${input.couponCode}
          FOR UPDATE
        `;
      }

      const address = input.deliveryAddress;
      const order = await tx.order.create({
        data: {
          tenantId: store.tenantId,
          storeId: store.id,
          idempotencyKey: input.idempotencyKey,
          idempotencyFingerprint,
          quoteFingerprint: quote.quoteFingerprint,
          publicTokenExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1_000),
          paymentReportToken: crypto.randomUUID(),
          paymentReportExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000),
          customerName: input.customerName,
          customerPhone: input.customerPhone,
          customerPhoneNormalized: normalizePhone(input.customerPhone),
          modality: input.modality,
          deliveryAddress: address ? formatDeliveryAddress(address) : null,
          deliveryZoneName: quote.deliveryZoneName,
          deliveryPostalCode: address?.postalCode ?? null,
          deliveryStreet: address?.street ?? null,
          deliveryNumber: address?.number ?? null,
          deliveryComplement: address?.complement || null,
          deliveryNeighborhood: address?.neighborhood ?? null,
          deliveryCity: address?.city ?? null,
          deliveryState: address?.state ?? null,
          deliveryReference: address?.reference || null,
          promisedFulfillmentMinAt: new Date(quote.promisedFulfillmentMinAt),
          promisedFulfillmentMaxAt: new Date(quote.promisedFulfillmentMaxAt),
          subtotal: quote.subtotal,
          deliveryFee: quote.deliveryFee,
          discount: quote.discount,
          total: quote.total,
          paymentMethod: input.paymentMethod,
          changeFor: input.changeFor ?? null,
          status: 'PENDING',
          paymentStatus: 'PENDING',
          notes: input.notes || null,
          couponId: quote.couponId,
          couponCode: quote.coupon?.code ?? null,
          items: {
            create: quote.lines.map((item) => ({
              productId: item.productId,
              productName: item.productName,
              unitPrice: item.unitPrice,
              quantity: item.quantity,
              notes: item.notes || null,
              itemTotal: item.itemTotal,
              options: {
                create: item.options.map((option) => ({
                  optionId: option.id,
                  optionName: option.name,
                  optionPrice: option.price,
                })),
              },
            })),
          },
          payment: {
            create: {
              method: input.paymentMethod,
              status: 'PENDING',
              amount: quote.total,
            },
          },
          statusHistory: {
            create: {
              fromStatus: null,
              toStatus: 'PENDING',
              note: 'Pedido criado pelo cliente',
              changedBy: 'system',
              actorNameSnapshot: 'Cliente',
              source: 'CUSTOMER',
              versionFrom: null,
              versionTo: 0,
            },
          },
        },
        select: {
          id: true,
          publicToken: true,
          orderNumber: true,
          paymentReportToken: true,
          createdAt: true,
          payment: { select: { id: true } },
        },
      });
      if (!order.payment) throw new OrderPaymentConsistencyError();

      if (quote.couponId && quote.coupon) {
        await tx.coupon.update({
          where: { id: quote.couponId },
          data: { usageCount: { increment: 1 } },
        });
        await tx.couponUsage.create({
          data: {
            couponId: quote.couponId,
            orderId: order.id,
            discount: quote.discount,
          },
        });
      }

      const auditLogId = await orderAudit.writeOrderCreatedAudit(tx, {
        tenantId: store.tenantId,
        storeId: store.id,
        orderId: order.id,
        orderNumber: order.orderNumber,
      });
      const outboxEvent = await appendOrderOutboxEvent(tx, {
        tenantId: store.tenantId,
        storeId: store.id,
        orderId: order.id,
        auditLogId,
        eventType: 'ORDER_CREATED',
        orderNumber: order.orderNumber,
        status: 'PENDING',
        paymentStatus: 'PENDING',
        aggregateVersion: 0,
        occurredAt: order.createdAt,
      });

      return {
        id: order.id,
        storeId: store.id,
        publicToken: order.publicToken,
        orderNumber: order.orderNumber,
        paymentReportToken: order.paymentReportToken,
        created: true,
        outboxEventIds: [outboxEvent.id],
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 5_000,
      timeout: 15_000,
    },
  );
}

function isRetryableTransactionError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034';
}

export async function createOrder(params: CreateOrderParams): Promise<CreateOrderResult> {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await createOrderOnce(params);
    } catch (error) {
      if (!isRetryableTransactionError(error) || attempt === maxAttempts) throw error;
    }
  }

  throw new Error('unreachable checkout transaction retry state');
}

/**
 * Busca um pedido público somente enquanto o token está dentro da retenção.
 */
export async function getOrderByPublicToken(publicToken: string) {
  return getDb().order.findFirst({
    where: { publicToken, publicTokenExpiresAt: { gt: new Date() } },
    select: {
      id: true,
      orderNumber: true,
      publicToken: true,
      customerName: true,
      customerPhone: true,
      modality: true,
      deliveryAddress: true,
      deliveryZoneName: true,
      subtotal: true,
      deliveryFee: true,
      discount: true,
      total: true,
      paymentMethod: true,
      changeFor: true,
      status: true,
      paymentStatus: true,
      version: true,
      statusChangedAt: true,
      preparingAt: true,
      readyAt: true,
      dispatchedAt: true,
      promisedFulfillmentMinAt: true,
      promisedFulfillmentMaxAt: true,
      updatedAt: true,
      cancellationReasonCode: true,
      notes: true,
      createdAt: true,
      items: {
        select: {
          id: true,
          productName: true,
          unitPrice: true,
          quantity: true,
          notes: true,
          itemTotal: true,
          options: {
            select: {
              optionName: true,
              optionPrice: true,
            },
          },
        },
      },
      store: {
        select: {
          name: true,
          slug: true,
          timeZone: true,
          whatsapp: true,
          settings: {
            select: {
              pixKeyType: true,
              pixKey: true,
              pixRecipient: true,
              pixBank: true,
              pixInstructions: true,
              estimatedTimeMinMinutes: true,
              estimatedTimeMaxMinutes: true,
            },
          },
        },
      },
    },
  });
}

export async function isPublicOrderTokenExpired(publicToken: string, storeSlug: string) {
  const order = await getDb().order.findFirst({
    where: {
      publicToken,
      publicTokenExpiresAt: { lte: new Date() },
      store: { slug: storeSlug },
    },
    select: { id: true },
  });
  return Boolean(order);
}

export async function getOrderTrackingStateByPublicToken(publicToken: string, storeSlug: string) {
  return getDb().order.findFirst({
    where: {
      publicToken,
      publicTokenExpiresAt: { gt: new Date() },
      store: { slug: storeSlug },
    },
    select: {
      orderNumber: true,
      modality: true,
      status: true,
      paymentStatus: true,
      version: true,
      createdAt: true,
      statusChangedAt: true,
      preparingAt: true,
      readyAt: true,
      dispatchedAt: true,
      promisedFulfillmentMinAt: true,
      promisedFulfillmentMaxAt: true,
      updatedAt: true,
      cancellationReasonCode: true,
      store: {
        select: {
          settings: {
            select: {
              estimatedTimeMinMinutes: true,
              estimatedTimeMaxMinutes: true,
            },
          },
        },
      },
    },
  });
}

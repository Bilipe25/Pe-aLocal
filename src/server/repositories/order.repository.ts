import 'server-only';

import { Prisma } from '@prisma/client';

import { normalizePhone, validatePixKey } from '@/lib/brazil';
import { getMercadoPagoConfig, isMercadoPagoEnabled } from '@/lib/mercado-pago/config';
import { credentialAad, encryptCredential } from '@/lib/mercado-pago/crypto';
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
import {
  type CheckoutCustomerAddress,
  persistCheckoutCustomerAfterOrder,
} from '@/server/services/customer-checkout-persistence.service';
import { persistDeviceRecognitionAfterOrder } from '@/server/services/customer-device-recognition.service';
import {
  consumeRecognitionSession,
  resolveActiveRecognitionSession,
  resolveRecognitionIdentity,
  resolveRecognitionAddressReference,
  type ResolvedRecognitionAddress,
} from '@/server/services/customer-recognition.service';
import { formatAddressForStore } from '@/server/services/customer-recognition-formatting';
import * as orderAudit from '@/server/services/order-audit.service';
import {
  assertMatchingOrderFingerprint,
  createOrderFingerprint,
} from '@/server/services/order-idempotency.service';
import { appendOrderOutboxEvent } from '@/server/services/order-outbox.service';

interface CreateOrderParams {
  input: CheckoutInput;
  storeSlug: string;
  recognitionBrowserToken?: string | null;
  deviceTokenHash?: string | null;
}

interface CreateOrderResult {
  id: string;
  storeId: string;
  publicToken: string;
  orderNumber: number;
  paymentReportToken: string | null;
  mercadoPagoPaymentId: string | null;
  onlinePayment: boolean;
  created: boolean;
  outboxEventIds: string[];
  customerNameConflict: boolean;
  rememberDeviceExpiresAt: Date | null;
}

/**
 * Revalida a cotação e cria o pedido na mesma transação serializável.
 * Nenhum preço, zona, cupom ou disponibilidade enviado pelo navegador é
 * tratado como fonte de verdade.
 */
async function createOrderOnce(params: CreateOrderParams): Promise<CreateOrderResult> {
  const { input, storeSlug, recognitionBrowserToken, deviceTokenHash } = params;

  return getDb().$transaction(
    async (tx) => {
      const store = await tx.store.findUnique({
        where: { slug: storeSlug },
        select: {
          id: true,
          tenantId: true,
          address: { select: { city: true, state: true } },
          settings: {
            select: {
              acceptsPix: true,
              pixKeyType: true,
              pixKey: true,
              acceptsCash: true,
              acceptsCardOnDelivery: true,
              paymentMode: true,
            },
          },
          entitlement: { select: { onlinePaymentsEnabled: true } },
          paymentProviderConnections: {
            where: { provider: 'MERCADO_PAGO', status: 'ACTIVE' },
            take: 1,
            select: { id: true },
          },
        },
      });
      if (!store) throw new NotFoundError('Loja');

      const idempotencyLockKey = `${store.id}:${input.idempotencyKey}`;
      await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(hashtextextended(${idempotencyLockKey}, 0))
      `;

      const now = new Date();
      const recognizedIdentity =
        input.identityMode === 'RECOGNIZED' && recognitionBrowserToken
          ? await resolveRecognitionIdentity({
              tenantId: store.tenantId,
              storeId: store.id,
              browserToken: recognitionBrowserToken,
              client: tx,
              now,
              allowConsumed: true,
            })
          : null;
      if (input.identityMode === 'RECOGNIZED' && !recognizedIdentity) {
        throw new CheckoutError(
          'CART_INVALID',
          'O reconhecimento expirou. Informe seus dados novamente para continuar.',
          409,
        );
      }
      const resolvedIdentity =
        input.identityMode === 'RECOGNIZED'
          ? {
              customerId: recognizedIdentity!.customerId,
              customerName: recognizedIdentity!.customerName,
              customerPhone: recognizedIdentity!.customerPhone,
              phoneNormalized: recognizedIdentity!.phoneNormalized,
            }
          : {
              customerId: null,
              customerName: input.customerName,
              customerPhone: input.customerPhone,
              phoneNormalized: normalizePhone(input.customerPhone),
            };
      const idempotencyFingerprint = createOrderFingerprint(
        input,
        resolvedIdentity.customerId
          ? {
              customerId: resolvedIdentity.customerId,
              customerName: resolvedIdentity.customerName,
              customerPhone: resolvedIdentity.customerPhone,
            }
          : null,
      );

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
          customerId: true,
          mercadoPagoPayment: { select: { id: true } },
        },
      });
      if (existing) {
        assertMatchingOrderFingerprint(existing.idempotencyFingerprint, idempotencyFingerprint);
        const remembered =
          input.saveCustomerData && existing.customerId && deviceTokenHash
            ? await persistDeviceRecognitionAfterOrder({
                tx,
                tokenHash: deviceTokenHash,
                tenantId: store.tenantId,
                storeId: store.id,
                customerId: existing.customerId,
                now,
              })
            : null;
        return {
          id: existing.id,
          storeId: store.id,
          publicToken: existing.publicToken,
          orderNumber: existing.orderNumber,
          paymentReportToken: existing.paymentReportToken,
          created: false,
          outboxEventIds: [],
          customerNameConflict: false,
          rememberDeviceExpiresAt: remembered?.expiresAt ?? null,
          mercadoPagoPaymentId: existing.mercadoPagoPayment?.id ?? null,
          onlinePayment: Boolean(existing.mercadoPagoPayment),
        };
      }

      if (recognizedIdentity?.consumedAt) {
        throw new CheckoutError(
          'CART_INVALID',
          'Esta sessão de reconhecimento já foi utilizada. Revise seus dados novamente.',
          409,
        );
      }
      const activeUnconfirmedRecognition =
        recognitionBrowserToken && !recognizedIdentity
          ? await resolveActiveRecognitionSession({
              tenantId: store.tenantId,
              storeId: store.id,
              browserToken: recognitionBrowserToken,
              client: tx,
              now,
            })
          : null;
      const recognizedCustomerId = recognizedIdentity?.customerId ?? null;

      let savedAddressResolution: ResolvedRecognitionAddress | null = null;
      if (input.savedAddressReference) {
        savedAddressResolution = recognitionBrowserToken
          ? await resolveRecognitionAddressReference({
              tenantId: store.tenantId,
              storeId: store.id,
              opaqueReference: input.savedAddressReference,
              browserToken: recognitionBrowserToken,
              client: tx,
              now,
            })
          : null;
        if (
          !savedAddressResolution ||
          savedAddressResolution.customerId !== recognizedCustomerId ||
          savedAddressResolution.sessionId !== recognizedIdentity?.sessionId
        ) {
          throw new CheckoutError(
            'SAVED_ADDRESS_UNAVAILABLE',
            'Este endereço não está mais disponível. Informe um novo endereço para continuar.',
            409,
          );
        }
      }

      const quote = await calculateCheckoutQuote(storeSlug, input, {
        client: tx,
        now,
        savedAddress: savedAddressResolution
          ? {
              ...savedAddressResolution.address,
              mappedDeliveryZoneId: savedAddressResolution.mappedDeliveryZoneId,
            }
          : null,
      });
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
              : issue?.code === 'SAVED_ADDRESS_UNAVAILABLE'
                ? 'SAVED_ADDRESS_UNAVAILABLE'
                : issue?.code === 'DELIVERY_ZONE_REQUIRED'
                  ? 'DELIVERY_ZONE_REQUIRED'
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
      const onlinePayment = Boolean(
        isMercadoPagoEnabled() &&
        store.entitlement?.onlinePaymentsEnabled &&
        settings.paymentMode === 'ONLINE' &&
        store.paymentProviderConnections[0],
      );
      if (onlinePayment) {
        if (input.paymentMethod !== 'PIX' || !input.payerEmail) {
          throw new CheckoutError(
            'CART_INVALID',
            'Informe um e-mail válido para gerar o Pix com confirmação automática.',
            422,
          );
        }
      } else if (input.paymentMethod === 'PIX') {
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
          'O cartão no recebimento não está disponível.',
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

      let address: CheckoutCustomerAddress | null = null;
      if (input.modality === 'DELIVERY') {
        if (savedAddressResolution) {
          address = {
            ...savedAddressResolution.address,
            zipCode: savedAddressResolution.address.zipCode?.replace(/\D/g, '') || null,
          };
        } else if (input.deliveryAddress && store.address && quote.deliveryZoneName) {
          address = {
            street: input.deliveryAddress.street,
            number: input.deliveryAddress.number,
            complement: input.deliveryAddress.complement || null,
            neighborhood: quote.deliveryZoneName,
            city: store.address.city,
            state: store.address.state.toUpperCase(),
            zipCode: input.deliveryAddress.postalCode ?? input.deliveryPostalCode ?? null,
            reference: input.deliveryAddress.reference || null,
          };
        } else {
          throw new CheckoutError(
            'CART_INVALID',
            'Não foi possível montar o endereço de entrega. Revise a região informada.',
          );
        }
      }
      const mercadoPagoPaymentId = onlinePayment ? crypto.randomUUID() : null;
      const encryptedPayerEmail =
        onlinePayment && input.payerEmail
          ? await encryptCredential(
              input.payerEmail.toLowerCase(),
              getMercadoPagoConfig().encryptionKey,
              credentialAad({
                tenantId: store.tenantId,
                storeId: store.id,
                provider: 'MERCADO_PAGO',
                kind: 'payer_email',
              }),
            )
          : null;
      const order = await tx.order.create({
        data: {
          tenantId: store.tenantId,
          storeId: store.id,
          idempotencyKey: input.idempotencyKey,
          idempotencyFingerprint,
          quoteFingerprint: quote.quoteFingerprint,
          publicTokenExpiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1_000),
          paymentReportToken: onlinePayment ? null : crypto.randomUUID(),
          paymentReportExpiresAt: onlinePayment
            ? null
            : new Date(now.getTime() + 7 * 24 * 60 * 60 * 1_000),
          customerName: resolvedIdentity.customerName,
          customerPhone: resolvedIdentity.customerPhone,
          customerPhoneNormalized: resolvedIdentity.phoneNormalized,
          modality: input.modality,
          deliveryAddress: address ? formatAddressForStore(address) : null,
          deliveryZoneName: quote.deliveryZoneName,
          deliveryPostalCode: address?.zipCode ?? null,
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
          status: onlinePayment ? 'AWAITING_PAYMENT' : 'PENDING',
          paymentStatus: 'PENDING',
          notes: input.notes || null,
          couponId: quote.couponId,
          couponCode: quote.coupon?.code ?? null,
          items: {
            create: quote.lines.map((item, position) => ({
              position,
              productId: item.productId,
              productName: item.productName,
              unitPrice: item.unitPrice,
              quantity: item.quantity,
              notes: item.notes || null,
              itemTotal: item.itemTotal,
              imageUrl: item.imageUrl,
              imageAssetId: item.imageAssetId,
              options: {
                create: item.options.map((option) => ({
                  position: option.position,
                  optionId: option.id,
                  optionName: option.name,
                  optionPrice: option.price,
                  groupId: option.groupId,
                  groupName: option.groupName,
                  groupPosition: option.groupPosition,
                })),
              },
            })),
          },
          payment: {
            create: {
              method: input.paymentMethod,
              provider: onlinePayment ? 'MERCADO_PAGO' : null,
              status: 'PENDING',
              amount: quote.total,
            },
          },
          statusHistory: {
            create: {
              fromStatus: null,
              toStatus: onlinePayment ? 'AWAITING_PAYMENT' : 'PENDING',
              note: onlinePayment
                ? 'Pedido criado e aguardando confirmação do pagamento online'
                : 'Pedido criado pelo cliente',
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

      if (onlinePayment && mercadoPagoPaymentId && encryptedPayerEmail) {
        await tx.mercadoPagoPayment.create({
          data: {
            id: mercadoPagoPaymentId,
            tenantId: store.tenantId,
            storeId: store.id,
            orderId: order.id,
            paymentId: order.payment.id,
            connectionId: store.paymentProviderConnections[0]!.id,
            creationStatus: 'PENDING',
            externalReference: `pl_${mercadoPagoPaymentId}`,
            idempotencyKey: `pl_${mercadoPagoPaymentId}`,
            payerEmailCiphertext: encryptedPayerEmail.ciphertext,
            payerEmailIv: encryptedPayerEmail.iv,
          },
        });
      }

      const persistedCustomer = await persistCheckoutCustomerAfterOrder({
        tx,
        tenantId: store.tenantId,
        storeId: store.id,
        orderId: order.id,
        input,
        customerName: resolvedIdentity.customerName,
        customerPhone: resolvedIdentity.customerPhone,
        recognizedCustomerId,
        address,
        deliveryZoneId: quote.deliveryZoneId,
        now,
      });

      const recognitionSessionId =
        recognizedIdentity?.sessionId ?? activeUnconfirmedRecognition?.sessionId ?? null;
      if (recognitionSessionId) {
        const consumed = await consumeRecognitionSession(tx, recognitionSessionId, now);
        if (recognizedIdentity && !consumed) {
          throw new CheckoutError(
            'SAVED_ADDRESS_UNAVAILABLE',
            'A sessão de reconhecimento expirou. Continue com os dados preenchidos manualmente.',
            409,
          );
        }
      }

      const remembered =
        input.saveCustomerData &&
        persistedCustomer.customerId &&
        !persistedCustomer.nameConflict &&
        deviceTokenHash
          ? await persistDeviceRecognitionAfterOrder({
              tx,
              tokenHash: deviceTokenHash,
              tenantId: store.tenantId,
              storeId: store.id,
              customerId: persistedCustomer.customerId,
              now,
            })
          : null;

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
        status: onlinePayment ? 'AWAITING_PAYMENT' : 'PENDING',
      });
      const outboxEvent = onlinePayment
        ? null
        : await appendOrderOutboxEvent(tx, {
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
        outboxEventIds: outboxEvent ? [outboxEvent.id] : [],
        customerNameConflict: persistedCustomer.nameConflict,
        rememberDeviceExpiresAt: remembered?.expiresAt ?? null,
        mercadoPagoPaymentId,
        onlinePayment,
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
      payment: { select: { provider: true } },
      mercadoPagoPayment: {
        select: {
          creationStatus: true,
          qrCode: true,
          ticketUrl: true,
          expiresAt: true,
        },
      },
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
        orderBy: [{ position: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          productName: true,
          unitPrice: true,
          quantity: true,
          notes: true,
          itemTotal: true,
          imageUrl: true,
          imageAssetId: true,
          options: {
            orderBy: [{ groupPosition: 'asc' }, { position: 'asc' }, { id: 'asc' }],
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
      total: true,
      items: {
        select: {
          productId: true,
          productName: true,
          unitPrice: true,
          quantity: true,
        },
      },
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

export async function getFullPublicOrderDetailsByToken(publicToken: string, storeSlug: string) {
  return getDb().order.findFirst({
    where: {
      publicToken,
      publicTokenExpiresAt: { gt: new Date() },
      store: { slug: storeSlug },
    },
    select: {
      id: true,
      tenantId: true,
      storeId: true,
      orderNumber: true,
      status: true,
      modality: true,
      paymentMethod: true,
      paymentStatus: true,
      subtotal: true,
      deliveryFee: true,
      discount: true,
      total: true,
      deliveryStreet: true,
      deliveryNumber: true,
      deliveryNeighborhood: true,
      deliveryCity: true,
      deliveryComplement: true,
      createdAt: true,
      statusChangedAt: true,
      acceptedAt: true,
      preparingAt: true,
      readyAt: true,
      dispatchedAt: true,
      deliveredAt: true,
      cancelledAt: true,
      items: {
        select: {
          id: true,
          productId: true,
          productName: true,
          unitPrice: true,
          quantity: true,
          notes: true,
          itemTotal: true,
          imageUrl: true,
          imageAssetId: true,
          options: {
            select: {
              optionName: true,
              optionPrice: true,
            },
          },
        },
      },
    },
  });
}

export async function hasActiveOrderTrackingToken(publicToken: string, storeSlug: string) {
  const order = await getDb().order.findFirst({
    where: {
      publicToken,
      publicTokenExpiresAt: { gt: new Date() },
      store: { slug: storeSlug },
    },
    select: { id: true },
  });
  return Boolean(order);
}

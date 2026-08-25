import 'server-only';

import { Prisma } from '@prisma/client';

import { addCents, assertCheckoutFinancialInvariants, MoneyArithmeticError } from '@/domain/money';

import { normalizePhone, validatePixKey } from '@/lib/brazil';
import {
  getMercadoPagoConfig,
  getMercadoPagoOAuthEnvironment,
  isMercadoPagoEnabled,
  isMercadoPagoOrdersCredentialReady,
} from '@/lib/mercado-pago/config';
import { credentialAad, encryptCredential } from '@/lib/mercado-pago/crypto';
import {
  MERCADO_PAGO_SANDBOX_PIX_AMOUNT_CENTS,
  MERCADO_PAGO_SANDBOX_PIX_AMOUNT_MESSAGE,
  MERCADO_PAGO_SANDBOX_PIX_EMAIL_MESSAGE,
  MERCADO_PAGO_SANDBOX_PIX_PAYER_EMAIL,
} from '@/lib/mercado-pago/sandbox';
import type { CheckoutInput, DineInCheckoutInput } from '@/schemas/checkout';
import type { PosOrderInput } from '@/schemas/pos';
import { getDb } from '@/server/database/client';
import {
  CheckoutError,
  NotFoundError,
  OrderPaymentConsistencyError,
  QuoteChangedError,
} from '@/server/errors';
import {
  calculateCheckoutQuote,
  applyAuthorizedPosManualDiscount,
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
  createPosOrderFingerprint,
} from '@/server/services/order-idempotency.service';
import { appendOrderOutboxEvent } from '@/server/services/order-outbox.service';
import {
  getOrCreateDiningSessionForCheckout,
  touchDiningSessionAfterOrder,
} from '@/server/services/dining-table-session.service';
import { persistPosCustomerAfterOrder } from '@/server/services/pos-customer-persistence.service';
import { acceptOrderInTransaction } from '@/server/services/order-workflow.service';
import { confirmManualPaymentInTransaction } from '@/server/services/order-payment.service';
import type { OrderMutationContext } from '@/server/services/order-mutation.types';

type CreateOrderParams =
  | {
      input: CheckoutInput;
      storeSlug: string;
      recognitionBrowserToken?: string | null;
      deviceTokenHash?: string | null;
      consumerSessionTokenHash?: string | null;
    }
  | {
      input: DineInCheckoutInput;
      tableToken: string;
    }
  | {
      input: PosOrderInput;
      pos: OrderMutationContext;
    };

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
  diningSessionPublicToken: string | null;
}

/**
 * Revalida a cotação e cria o pedido na mesma transação serializável.
 * Nenhum preço, zona, cupom ou disponibilidade enviado pelo navegador é
 * tratado como fonte de verdade.
 */
async function createOrderOnce(params: CreateOrderParams): Promise<CreateOrderResult> {
  const { input } = params;
  const dineIn = 'tableToken' in params;
  const pos = 'pos' in params;
  const posMutationContext = pos ? params.pos : null;
  const standardInput = dineIn || pos ? null : (input as CheckoutInput);
  const dineInInput = dineIn ? (input as DineInCheckoutInput) : null;
  const posInput = pos ? (input as PosOrderInput) : null;
  const recognitionBrowserToken = dineIn || pos ? null : params.recognitionBrowserToken;
  const deviceTokenHash = dineIn || pos ? null : params.deviceTokenHash;
  const consumerSessionTokenHash = dineIn || pos ? null : params.consumerSessionTokenHash;

  return getDb().$transaction(
    async (tx) => {
      const diningTable = dineIn
        ? await tx.storeDiningTable.findUnique({
            where: { publicToken: params.tableToken },
            select: {
              id: true,
              tenantId: true,
              storeId: true,
              label: true,
              isActive: true,
              version: true,
            },
          })
        : pos && posInput!.modality === 'DINE_IN'
          ? await tx.storeDiningTable.findFirst({
              where: {
                id: posInput!.diningTableId,
                tenantId: params.pos.tenantId,
                storeId: params.pos.storeId,
              },
              select: {
                id: true,
                tenantId: true,
                storeId: true,
                label: true,
                isActive: true,
                version: true,
              },
            })
          : null;
      if (dineIn && !diningTable) throw new NotFoundError('QR Code');

      const storeSelect = {
        id: true,
        tenantId: true,
        slug: true,
        address: { select: { city: true, state: true } },
        settings: {
          select: {
            acceptsPix: true,
            pixKeyType: true,
            pixKey: true,
            acceptsCash: true,
            acceptsCardOnDelivery: true,
            acceptsCardInPerson: true,
            paymentMode: true,
          },
        },
        entitlement: {
          select: { onlinePaymentsEnabled: true, dineInQrEnabled: true, posEnabled: true, consumerIdentityEnabled: true },
        },
        paymentProviderConnections: {
          where: { provider: 'MERCADO_PAGO', status: 'ACTIVE' },
          take: 1,
          select: { id: true },
        },
      } satisfies Prisma.StoreSelect;
      const store = dineIn
        ? await tx.store.findFirst({
            where: { id: diningTable!.storeId, tenantId: diningTable!.tenantId },
            select: storeSelect,
          })
        : pos
          ? await tx.store.findFirst({
              where: { id: params.pos.storeId, tenantId: params.pos.tenantId },
              select: storeSelect,
            })
          : await tx.store.findUnique({
              where: { slug: params.storeSlug },
              select: storeSelect,
            });
      if (!store) throw new NotFoundError('Loja');
      if (pos && !store.entitlement?.posEnabled) {
        throw new CheckoutError(
          'STORE_UNAVAILABLE',
          'O PDV não está habilitado para esta loja.',
          409,
        );
      }
      const posTerminal =
        pos && posInput!.posTerminalId
          ? await tx.storePosTerminal.findFirst({
              where: {
                id: posInput!.posTerminalId,
                tenantId: store.tenantId,
                storeId: store.id,
              },
              select: { id: true, name: true, isActive: true },
            })
          : null;
      if (pos && posInput!.posTerminalId && !posTerminal?.isActive) {
        throw new CheckoutError(
          'CART_INVALID',
          'O terminal selecionado está inativo ou não pertence a esta loja.',
          409,
        );
      }
      if (
        (dineIn || (pos && posInput!.modality === 'DINE_IN')) &&
        (!diningTable?.isActive ||
          !store.entitlement?.dineInQrEnabled ||
          diningTable.tenantId !== store.tenantId ||
          diningTable.storeId !== store.id)
      ) {
        throw new CheckoutError(
          'STORE_UNAVAILABLE',
          pos
            ? 'Esta mesa não está disponível para novos pedidos.'
            : 'Este QR Code não está disponível. Peça ajuda à equipe.',
          409,
        );
      }

      const idempotencyLockKey = `${store.id}:${input.idempotencyKey}`;
      await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(hashtextextended(${idempotencyLockKey}, 0))
      `;

      const now = new Date();
      let posDraft: {
        id: string;
        status: 'OPEN' | 'CONVERTED' | 'DISCARDED' | 'EXPIRED';
        version: number;
        expiresAt: Date;
        convertedOrderId: string | null;
      } | null = null;
      if (pos && posInput!.draftId && posInput!.expectedDraftVersion != null) {
        const locked = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT "id"
          FROM "pos_drafts"
          WHERE "id" = ${posInput!.draftId}
            AND "tenantId" = ${store.tenantId}
            AND "storeId" = ${store.id}
          FOR UPDATE
        `;
        if (locked.length !== 1) {
          throw new CheckoutError(
            'CART_INVALID',
            'Este pedido em espera não está mais disponível.',
            409,
          );
        }
        posDraft = await tx.posDraft.findFirst({
          where: {
            id: posInput!.draftId,
            tenantId: store.tenantId,
            storeId: store.id,
          },
          select: {
            id: true,
            status: true,
            version: true,
            expiresAt: true,
            convertedOrderId: true,
          },
        });
        if (
          !posDraft ||
          (posDraft.status === 'OPEN' &&
            (posDraft.version !== posInput!.expectedDraftVersion || posDraft.expiresAt <= now)) ||
          (posDraft.status !== 'OPEN' && posDraft.status !== 'CONVERTED')
        ) {
          throw new CheckoutError(
            'CART_INVALID',
            'Este pedido em espera foi alterado em outro terminal. Atualize a lista.',
            409,
          );
        }
      }
      const posCustomer =
        pos && posInput!.customerId
          ? await tx.customer.findFirst({
              where: { id: posInput!.customerId, tenantId: store.tenantId },
              select: { id: true, name: true, phone: true, phoneNormalized: true },
            })
          : null;
      if (pos && posInput!.customerId && !posCustomer) {
        throw new CheckoutError('CART_INVALID', 'O cliente selecionado não está disponível.', 422);
      }
      const requestedAddressId = posInput?.deliveryAddress?.customerAddressId;
      if (pos && requestedAddressId && !posCustomer) {
        throw new CheckoutError(
          'CART_INVALID',
          'Selecione o cliente vinculado ao endereço salvo.',
          422,
        );
      }
      const posSavedAddress =
        pos && requestedAddressId
          ? await tx.customerAddress.findFirst({
              where: {
                id: requestedAddressId,
                tenantId: store.tenantId,
                ...(posCustomer ? { customerId: posCustomer.id } : {}),
              },
              select: {
                id: true,
                street: true,
                number: true,
                complement: true,
                neighborhood: true,
                city: true,
                state: true,
                zipCode: true,
                reference: true,
                addressFingerprint: true,
                updatedAt: true,
                storeUses: {
                  where: { storeId: store.id },
                  take: 1,
                  select: { deliveryZoneId: true },
                },
              },
            })
          : null;
      if (pos && requestedAddressId && !posSavedAddress) {
        throw new CheckoutError('CART_INVALID', 'O endereço selecionado não está disponível.', 422);
      }
      const recognizedIdentity =
        standardInput?.identityMode === 'RECOGNIZED' && recognitionBrowserToken
          ? await resolveRecognitionIdentity({
              tenantId: store.tenantId,
              storeId: store.id,
              browserToken: recognitionBrowserToken,
              client: tx,
              now,
              allowConsumed: true,
            })
          : null;
      const authenticatedIdentity =
        standardInput?.identityMode === 'AUTHENTICATED' && consumerSessionTokenHash
          ? await tx.consumerSession.findFirst({
              where: {
                tokenHash: consumerSessionTokenHash,
                revokedAt: null,
                expiresAt: { gt: now },
                consumerIdentity: {
                  customers: { some: { tenantId: store.tenantId } },
                },
              },
              select: {
                consumerIdentity: {
                  select: {
                    customers: {
                      where: { tenantId: store.tenantId },
                      take: 1,
                      select: { id: true, name: true, phone: true, phoneNormalized: true },
                    },
                  },
                },
              },
            })
          : null;
      if (standardInput?.identityMode === 'RECOGNIZED' && !recognizedIdentity) {
        throw new CheckoutError(
          'CART_INVALID',
          'O reconhecimento expirou. Informe seus dados novamente para continuar.',
          409,
        );
      }
      if (
        standardInput?.identityMode === 'AUTHENTICATED' &&
        (!store.entitlement?.consumerIdentityEnabled || !authenticatedIdentity?.consumerIdentity.customers[0])
      ) {
        throw new CheckoutError(
          'CART_INVALID',
          'Sua conta expirou. Continue como visitante para não perder o carrinho.',
          409,
        );
      }
      const authenticatedCustomer = authenticatedIdentity?.consumerIdentity.customers[0] ?? null;
      const resolvedIdentity = pos
        ? {
            customerId: posCustomer?.id ?? null,
            customerName: (posCustomer?.name ?? posInput!.customerName) || null,
            customerPhone: (posCustomer?.phone ?? posInput!.customerPhone) || null,
            phoneNormalized:
              posCustomer?.phoneNormalized ||
              (posInput!.customerPhone ? normalizePhone(posInput!.customerPhone) : null),
          }
        : dineIn
          ? {
              customerId: null,
              customerName: dineInInput!.customerName,
              customerPhone: null,
              phoneNormalized: null,
            }
          : standardInput!.identityMode === 'AUTHENTICATED'
            ? {
                customerId: authenticatedCustomer!.id,
                customerName: authenticatedCustomer!.name,
                customerPhone: authenticatedCustomer!.phone,
                phoneNormalized: authenticatedCustomer!.phoneNormalized,
              }
          : standardInput!.identityMode === 'RECOGNIZED'
            ? {
                customerId: recognizedIdentity!.customerId,
                customerName: recognizedIdentity!.customerName,
                customerPhone: recognizedIdentity!.customerPhone,
                phoneNormalized: recognizedIdentity!.phoneNormalized,
              }
            : {
                customerId: null,
                customerName: standardInput!.customerName,
                customerPhone: standardInput!.customerPhone,
                phoneNormalized: normalizePhone(standardInput!.customerPhone),
              };
      const idempotencyFingerprint = pos
        ? createPosOrderFingerprint(posInput!, {
            customerId: resolvedIdentity.customerId,
            diningTableId: diningTable?.id ?? null,
            addressId: posSavedAddress?.id ?? null,
          })
        : createOrderFingerprint(
            input as CheckoutInput | DineInCheckoutInput,
            resolvedIdentity.customerId
              ? {
                  customerId: resolvedIdentity.customerId,
                  customerName: resolvedIdentity.customerName!,
                  customerPhone: resolvedIdentity.customerPhone!,
                }
              : null,
            dineIn
              ? { diningTableId: diningTable!.id, diningTableVersion: diningTable!.version }
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
          diningTableSession: { select: { publicToken: true } },
        },
      });
      if (existing) {
        assertMatchingOrderFingerprint(existing.idempotencyFingerprint, idempotencyFingerprint);
        if (posDraft?.status === 'CONVERTED' && posDraft.convertedOrderId !== existing.id) {
          throw new CheckoutError(
            'CART_INVALID',
            'Este pedido em espera já foi finalizado em outro pedido.',
            409,
          );
        }
        if (posDraft?.status === 'OPEN') {
          const converted = await tx.posDraft.updateMany({
            where: {
              id: posDraft.id,
              tenantId: store.tenantId,
              storeId: store.id,
              status: 'OPEN',
              version: posDraft.version,
            },
            data: {
              status: 'CONVERTED',
              version: { increment: 1 },
              convertedOrderId: existing.id,
              payloadCiphertext: '',
              payloadIv: '',
            },
          });
          if (converted.count !== 1) {
            throw new CheckoutError(
              'CART_INVALID',
              'Este pedido em espera foi alterado em outro terminal. Atualize a lista.',
              409,
            );
          }
        }
        const remembered =
          standardInput?.saveCustomerData && existing.customerId && deviceTokenHash
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
          diningSessionPublicToken: existing.diningTableSession?.publicToken ?? null,
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
        !dineIn && recognitionBrowserToken && !recognizedIdentity
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
      if (standardInput?.savedAddressReference) {
        savedAddressResolution = recognitionBrowserToken
          ? await resolveRecognitionAddressReference({
              tenantId: store.tenantId,
              storeId: store.id,
              opaqueReference: standardInput.savedAddressReference,
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

      const quoteInput = pos
        ? posInput!.modality === 'DINE_IN'
          ? {
              modality: 'DINE_IN' as const,
              items: posInput!.items,
              couponCode: posInput!.couponCode,
            }
          : {
              modality: posInput!.modality,
              items: posInput!.items,
              couponCode: posInput!.couponCode,
              deliveryZoneId: posInput!.deliveryAddress?.deliveryZoneId,
              deliveryPostalCode: posInput!.deliveryAddress?.postalCode,
              deliveryAddress: posInput!.deliveryAddress
                ? {
                    postalCode: posInput!.deliveryAddress.postalCode,
                    street: posInput!.deliveryAddress.street,
                    number: posInput!.deliveryAddress.number,
                    complement: posInput!.deliveryAddress.complement,
                    reference: posInput!.deliveryAddress.reference,
                  }
                : undefined,
            }
        : dineIn
          ? { ...dineInInput!, modality: 'DINE_IN' as const }
          : standardInput!;
      const baseQuote = await calculateCheckoutQuote(
        dineIn || pos ? store.slug : params.storeSlug,
        quoteInput,
        {
          client: tx,
          now,
          savedAddress: posSavedAddress
            ? {
                id: posSavedAddress.id,
                addressFingerprint: posSavedAddress.addressFingerprint,
                updatedAt: posSavedAddress.updatedAt,
                street: posSavedAddress.street,
                number: posSavedAddress.number,
                complement: posSavedAddress.complement,
                neighborhood: posSavedAddress.neighborhood,
                city: posSavedAddress.city,
                state: posSavedAddress.state,
                zipCode: posSavedAddress.zipCode,
                reference: posSavedAddress.reference,
                mappedDeliveryZoneId:
                  posSavedAddress.storeUses[0]?.deliveryZoneId ??
                  posInput?.deliveryAddress?.deliveryZoneId ??
                  null,
              }
            : savedAddressResolution
              ? {
                  ...savedAddressResolution.address,
                  mappedDeliveryZoneId: savedAddressResolution.mappedDeliveryZoneId,
                }
              : null,
          ...(dineIn || (pos && posInput!.modality === 'DINE_IN') ? { diningTable } : {}),
          ...(pos ? { channel: 'POS' as const } : {}),
        },
      );
      if (!baseQuote) throw new NotFoundError('Loja');
      const quote = pos
        ? applyAuthorizedPosManualDiscount(baseQuote, posInput!.manualDiscount)
        : baseQuote;
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
      try {
        assertCheckoutFinancialInvariants({
          subtotal: quote.subtotal,
          automaticDiscount: quote.automaticDiscount ?? 0,
          couponDiscount: quote.couponDiscount ?? 0,
          manualDiscount: quote.manualDiscount ?? 0,
          discount: quote.discount,
          deliveryFee: quote.deliveryFee,
          total: quote.total,
          paymentAmount: quote.total,
          adjustments: quote.adjustments ?? [],
          offerGroups: quote.offerGroups ?? [],
        });
      } catch (error) {
        if (!(error instanceof MoneyArithmeticError)) throw error;
        throw new OrderPaymentConsistencyError();
      }

      const settings = store.settings;
      if (!settings) {
        throw new CheckoutError(
          'STORE_UNAVAILABLE',
          'A loja ainda não configurou as opções de pedido.',
          409,
        );
      }
      const onlinePaymentAvailable = Boolean(
        isMercadoPagoEnabled() &&
        isMercadoPagoOrdersCredentialReady() &&
        store.entitlement?.onlinePaymentsEnabled &&
        settings.paymentMode === 'ONLINE' &&
        store.paymentProviderConnections[0],
      );
      // Pix online Mercado Pago não faz parte do PDV V1. No canal interno,
      // PIX representa somente o método manual já configurado pela loja.
      const onlinePayment = !pos && onlinePaymentAvailable && input.paymentMethod === 'PIX';
      const payerEmail = standardInput?.payerEmail ?? dineInInput?.payerEmail;
      if (onlinePayment) {
        if (!payerEmail) {
          throw new CheckoutError(
            'CART_INVALID',
            'Informe um e-mail válido para gerar o Pix com confirmação automática.',
            422,
            [{ path: 'payerEmail' }],
          );
        }
        if (getMercadoPagoOAuthEnvironment() === 'sandbox') {
          if (payerEmail.trim().toLowerCase() !== MERCADO_PAGO_SANDBOX_PIX_PAYER_EMAIL) {
            throw new CheckoutError('CART_INVALID', MERCADO_PAGO_SANDBOX_PIX_EMAIL_MESSAGE, 422, [
              { path: 'payerEmail', code: 'invalid_email_for_sandbox' },
            ]);
          }
          if (quote.total !== MERCADO_PAGO_SANDBOX_PIX_AMOUNT_CENTS) {
            throw new CheckoutError('CART_INVALID', MERCADO_PAGO_SANDBOX_PIX_AMOUNT_MESSAGE, 422, [
              { path: 'paymentMethod', code: 'invalid_amount_for_sandbox' },
            ]);
          }
        }
      } else if (input.paymentMethod === 'PIX') {
        if (dineIn && !pos) {
          throw new CheckoutError(
            'STORE_UNAVAILABLE',
            'O Pix online está temporariamente indisponível. Escolha dinheiro ou cartão na mesa.',
            409,
          );
        }
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
      } else if (input.paymentMethod === 'CARD_IN_PERSON' && !settings.acceptsCardInPerson) {
        throw new CheckoutError('STORE_UNAVAILABLE', 'O cartão na mesa não está disponível.', 409);
      }
      if (pos && input.paymentMethod === 'CARD_ON_DELIVERY' && posInput!.modality !== 'DELIVERY') {
        throw new CheckoutError('CART_INVALID', 'Cartão na entrega é exclusivo para Delivery.');
      }
      if (pos && input.paymentMethod === 'CARD_IN_PERSON' && posInput!.modality === 'DELIVERY') {
        throw new CheckoutError('CART_INVALID', 'Cartão presencial não é válido para Delivery.');
      }
      if (
        pos &&
        posInput!.modality === 'DELIVERY' &&
        posInput!.paidNow &&
        input.paymentMethod !== 'PIX'
      ) {
        throw new CheckoutError(
          'CART_INVALID',
          'No Delivery, somente o Pix manual pode ser marcado como pago agora.',
        );
      }
      if (
        standardInput &&
        input.paymentMethod === 'CASH' &&
        standardInput.changeFor != null &&
        standardInput.changeFor < quote.total
      ) {
        throw new CheckoutError(
          'CART_INVALID',
          'O valor para troco precisa ser igual ou maior que o total.',
        );
      }
      if (
        pos &&
        input.paymentMethod === 'CASH' &&
        posInput!.changeFor != null &&
        posInput!.changeFor < quote.total
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
        const lockedCoupon = await tx.coupon.findUnique({
          where: { id: quote.couponId },
          select: {
            maxUsages: true,
            usageCount: true,
            _count: {
              select: {
                reservations: { where: { status: 'ACTIVE', expiresAt: { gt: now } } },
              },
            },
          },
        });
        if (
          !lockedCoupon ||
          (lockedCoupon.maxUsages != null &&
            lockedCoupon.usageCount + lockedCoupon._count.reservations >= lockedCoupon.maxUsages)
        ) {
          throw new CheckoutError(
            'COUPON_INVALID',
            'Este cupom acabou de atingir o limite de usos.',
            409,
          );
        }
      }

      let address: CheckoutCustomerAddress | null = null;
      if (posInput?.modality === 'DELIVERY' || standardInput?.modality === 'DELIVERY') {
        if (posSavedAddress) {
          address = {
            id: posSavedAddress.id,
            street: posSavedAddress.street,
            number: posSavedAddress.number,
            complement: posSavedAddress.complement,
            neighborhood: posSavedAddress.neighborhood,
            city: posSavedAddress.city,
            state: posSavedAddress.state,
            zipCode: posSavedAddress.zipCode,
            reference: posSavedAddress.reference,
          };
        } else if (posInput?.deliveryAddress) {
          address = {
            street: posInput.deliveryAddress.street,
            number: posInput.deliveryAddress.number,
            complement: posInput.deliveryAddress.complement || null,
            neighborhood: posInput.deliveryAddress.neighborhood,
            city: posInput.deliveryAddress.city,
            state: posInput.deliveryAddress.state,
            zipCode: posInput.deliveryAddress.postalCode ?? null,
            reference: posInput.deliveryAddress.reference || null,
          };
        } else if (savedAddressResolution) {
          address = {
            ...savedAddressResolution.address,
            zipCode: savedAddressResolution.address.zipCode?.replace(/\D/g, '') || null,
          };
        } else if (standardInput?.deliveryAddress && store.address && quote.deliveryZoneName) {
          address = {
            street: standardInput.deliveryAddress.street,
            number: standardInput.deliveryAddress.number,
            complement: standardInput.deliveryAddress.complement || null,
            neighborhood: quote.deliveryZoneName,
            city: store.address.city,
            state: store.address.state.toUpperCase(),
            zipCode:
              standardInput.deliveryAddress.postalCode ?? standardInput.deliveryPostalCode ?? null,
            reference: standardInput.deliveryAddress.reference || null,
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
        onlinePayment && payerEmail
          ? await encryptCredential(
              payerEmail.toLowerCase(),
              getMercadoPagoConfig().encryptionKey,
              credentialAad({
                tenantId: store.tenantId,
                storeId: store.id,
                provider: 'MERCADO_PAGO',
                kind: 'payer_email',
              }),
            )
          : null;
      const diningSession =
        dineIn || (pos && posInput!.modality === 'DINE_IN')
          ? await getOrCreateDiningSessionForCheckout(tx, diningTable!, now)
          : null;
      const offerGroups = quote.offerGroups ?? [];
      const adjustments = quote.adjustments ?? [];
      const adjustmentSourceIds = [
        ...new Set(
          adjustments.flatMap((adjustment) =>
            adjustment.type !== 'COUPON' && adjustment.sourceId ? [adjustment.sourceId] : [],
          ),
        ),
      ].sort();
      const canonicalOffers =
        adjustmentSourceIds.length > 0
          ? await tx.storeOffer.findMany({
              where: {
                id: { in: adjustmentSourceIds },
                tenantId: store.tenantId,
                storeId: store.id,
              },
              select: {
                id: true,
                maxTotalUses: true,
                maxUsesPerCustomer: true,
              },
              orderBy: { id: 'asc' },
            })
          : [];
      if (canonicalOffers.length > 0) {
        await tx.$queryRaw`
          SELECT "id" FROM "store_offers"
          WHERE "id" IN (${Prisma.join(canonicalOffers.map((offer) => offer.id))})
            AND "tenantId" = ${store.tenantId}
            AND "storeId" = ${store.id}
          ORDER BY "id"
          FOR UPDATE
        `;
        for (const offer of canonicalOffers) {
          const totalUsageCount = await tx.storeOfferUsage.count({
            where: { offerId: offer.id, status: { in: ['RESERVED', 'CONSUMED'] } },
          });
          if (offer.maxTotalUses != null && totalUsageCount >= offer.maxTotalUses) {
            throw new CheckoutError(
              'CART_INVALID',
              'Uma oferta acabou de atingir o limite de usos.',
              409,
            );
          }
          if (offer.maxUsesPerCustomer != null && resolvedIdentity.customerId) {
            const customerUsageCount = await tx.storeOfferUsage.count({
              where: {
                offerId: offer.id,
                customerId: resolvedIdentity.customerId,
                status: { in: ['RESERVED', 'CONSUMED'] },
              },
            });
            if (customerUsageCount >= offer.maxUsesPerCustomer) {
              throw new CheckoutError(
                'CART_INVALID',
                'Esta oferta já atingiu seu limite por cliente.',
                409,
              );
            }
          }
        }
      }
      const requiresSeparatedItems =
        offerGroups.length > 0 || adjustments.some((adjustment) => adjustment.lineId != null);
      const offerGroupIdByLineId = new Map(
        offerGroups.map((group) => [group.lineId, crypto.randomUUID()]),
      );
      const orderItemIdByLineId = new Map(
        quote.lines.map((line) => [line.lineId, crypto.randomUUID()]),
      );
      const order = await tx.order.create({
        data: {
          tenantId: store.tenantId,
          storeId: store.id,
          customerId: resolvedIdentity.customerId,
          createdById: pos ? params.pos.userId : null,
          origin: pos ? 'POS' : dineIn ? 'DINE_IN_QR' : 'STOREFRONT',
          posTerminalId: posTerminal?.id ?? null,
          posTerminalLabelSnapshot: posTerminal?.name ?? null,
          idempotencyKey: input.idempotencyKey,
          idempotencyFingerprint,
          quoteFingerprint: quote.quoteFingerprint,
          publicTokenExpiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1_000),
          paymentReportToken: onlinePayment || dineIn || pos ? null : crypto.randomUUID(),
          paymentReportExpiresAt:
            onlinePayment || dineIn || pos
              ? null
              : new Date(now.getTime() + 7 * 24 * 60 * 60 * 1_000),
          customerName: resolvedIdentity.customerName,
          customerPhone: resolvedIdentity.customerPhone,
          customerPhoneNormalized: resolvedIdentity.phoneNormalized,
          modality: pos ? posInput!.modality : dineIn ? 'DINE_IN' : standardInput!.modality,
          diningTableId: diningTable?.id ?? null,
          diningTableSessionId: diningSession?.id ?? null,
          diningTableLabelSnapshot: diningTable?.label ?? null,
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
          promisedFulfillmentMinAt: onlinePayment ? null : new Date(quote.promisedFulfillmentMinAt),
          promisedFulfillmentMaxAt: onlinePayment ? null : new Date(quote.promisedFulfillmentMaxAt),
          operationalStartedAt: onlinePayment ? null : now,
          subtotal: quote.subtotal,
          deliveryFee: quote.deliveryFee,
          discount: quote.discount,
          total: quote.total,
          paymentMethod: input.paymentMethod,
          changeFor: posInput?.changeFor ?? standardInput?.changeFor ?? null,
          status: onlinePayment ? 'AWAITING_PAYMENT' : 'PENDING',
          paymentStatus: 'PENDING',
          notes: input.notes || null,
          couponId: quote.couponId,
          couponCode: quote.coupon?.code ?? null,
          ...(!requiresSeparatedItems
            ? {
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
              }
            : {}),
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
                : pos
                  ? 'Pedido criado no PDV'
                  : 'Pedido criado pelo cliente',
              changedBy: pos ? params.pos.userId : 'system',
              changedById: pos ? params.pos.userId : null,
              actorNameSnapshot: pos ? params.pos.userName : 'Cliente',
              source: pos ? 'DASHBOARD' : 'CUSTOMER',
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

      if (canonicalOffers.length > 0) {
        await tx.storeOfferUsage.createMany({
          data: canonicalOffers.map((offer) => {
            const offerAdjustments = adjustments.filter(
              (adjustment) => adjustment.sourceId === offer.id,
            );
            return {
              tenantId: store.tenantId,
              storeId: store.id,
              offerId: offer.id,
              orderId: order.id,
              customerId: resolvedIdentity.customerId,
              status: 'RESERVED' as const,
              applicationCount: offerAdjustments.length,
              discountAmount: offerAdjustments.reduce(
                (total, adjustment) => addCents(total, adjustment.amount),
                0,
              ),
              expiresAt: onlinePayment ? new Date(now.getTime() + 30 * 60_000) : null,
            };
          }),
        });
      }

      if (offerGroups.length > 0) {
        await tx.orderOfferGroup.createMany({
          data: offerGroups.map((group, position) => ({
            id: offerGroupIdByLineId.get(group.lineId)!,
            tenantId: store.tenantId,
            storeId: store.id,
            orderId: order.id,
            offerType: 'COMBO',
            sourceOfferIdSnapshot: group.comboId,
            sourceOfferVersion: group.comboVersion,
            nameSnapshot: group.name,
            quantity: group.quantity,
            position,
            regularBaseAmount: group.regularBaseAmount,
            offerBaseAmount: group.offerBaseAmount,
            discountAmount: group.discountAmount,
          })),
        });
      }
      for (const [position, item] of requiresSeparatedItems ? quote.lines.entries() : []) {
        await tx.orderItem.create({
          data: {
            id: orderItemIdByLineId.get(item.lineId)!,
            orderId: order.id,
            offerGroupId: item.offerGroupLineId
              ? (offerGroupIdByLineId.get(item.offerGroupLineId) ?? null)
              : null,
            offerComponentPosition: item.offerComponentPosition ?? null,
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
          },
        });
      }
      if (adjustments.length > 0) {
        const adjustmentRows = adjustments.map((adjustment, position) => ({
          id: crypto.randomUUID(),
          tenantId: store.tenantId,
          storeId: store.id,
          orderId: order.id,
          adjustmentType: adjustment.type,
          sourceIdSnapshot: adjustment.sourceId,
          sourceVersion: adjustment.sourceVersion,
          labelSnapshot: adjustment.label,
          amount: adjustment.amount,
          orderItemId: adjustment.lineId
            ? (orderItemIdByLineId.get(adjustment.lineId) ?? null)
            : null,
          orderOfferGroupId: adjustment.offerGroupLineId
            ? (offerGroupIdByLineId.get(adjustment.offerGroupLineId) ?? null)
            : null,
          position,
        }));
        await tx.orderPriceAdjustment.createMany({
          data: adjustmentRows,
        });
        if (posInput?.manualDiscount) {
          const manualRow = adjustmentRows.find(
            (adjustment) => adjustment.adjustmentType === 'MANUAL_DISCOUNT',
          );
          if (!manualRow) throw new OrderPaymentConsistencyError();
          const eligibleBase =
            quote.subtotal - (quote.automaticDiscount ?? 0) - (quote.couponDiscount ?? 0);
          await tx.posManualDiscountLedger.create({
            data: {
              tenantId: store.tenantId,
              storeId: store.id,
              orderId: order.id,
              adjustmentId: manualRow.id,
              appliedById: posMutationContext!.userId,
              authorizedById: posMutationContext!.userId,
              mode: posInput.manualDiscount.mode,
              requestedValue: posInput.manualDiscount.value,
              eligibleBase,
              amount: manualRow.amount,
              reasonCode: posInput.manualDiscount.reasonCode,
              reasonNote: posInput.manualDiscount.reasonNote ?? null,
            },
          });
          await tx.auditLog.create({
            data: {
              tenantId: store.tenantId,
              storeId: store.id,
              userId: posMutationContext!.userId,
              action: 'POS_MANUAL_DISCOUNT_APPLIED',
              entity: 'Order',
              entityId: order.id,
              metadata: {
                orderId: order.id,
                actorUserId: posMutationContext!.userId,
                authorizedByUserId: posMutationContext!.userId,
                mode: posInput.manualDiscount.mode,
                requestedValue: posInput.manualDiscount.value,
                eligibleBase,
                amount: manualRow.amount,
                reasonCode: posInput.manualDiscount.reasonCode,
              },
            },
          });
        }
      }
      if (diningSession) {
        await touchDiningSessionAfterOrder(tx, diningSession.id, now);
      }

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
            expiresAt: new Date(now.getTime() + 30 * 60_000),
            payerEmailCiphertext: encryptedPayerEmail.ciphertext,
            payerEmailIv: encryptedPayerEmail.iv,
          },
        });
      }

      const persistedCustomer = pos
        ? {
            ...(await persistPosCustomerAfterOrder({
              tx,
              tenantId: store.tenantId,
              storeId: store.id,
              orderId: order.id,
              orderInput: posInput!,
              address: posInput!.deliveryAddress?.customerAddressId
                ? null
                : (posInput!.deliveryAddress ?? null),
              now,
            })),
            nameConflict: false,
          }
        : dineIn
          ? { customerId: null, addressId: null, nameConflict: false }
          : await persistCheckoutCustomerAfterOrder({
              tx,
              tenantId: store.tenantId,
              storeId: store.id,
              orderId: order.id,
              input: standardInput!,
              customerName: resolvedIdentity.customerName ?? undefined,
              customerPhone: resolvedIdentity.customerPhone!,
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
        standardInput?.saveCustomerData &&
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
        if (onlinePayment) {
          await tx.couponReservation.create({
            data: {
              couponId: quote.couponId,
              orderId: order.id,
              discount: quote.couponDiscount ?? quote.coupon.discount,
              expiresAt: new Date(now.getTime() + 35 * 60_000),
            },
          });
        } else {
          await tx.coupon.update({
            where: { id: quote.couponId },
            data: { usageCount: { increment: 1 } },
          });
          await tx.couponUsage.create({
            data: {
              couponId: quote.couponId,
              orderId: order.id,
              discount: quote.couponDiscount ?? quote.coupon.discount,
            },
          });
        }
      }

      const auditLogId = await orderAudit.writeOrderCreatedAudit(tx, {
        tenantId: store.tenantId,
        storeId: store.id,
        orderId: order.id,
        orderNumber: order.orderNumber,
        status: onlinePayment ? 'AWAITING_PAYMENT' : 'PENDING',
        userId: pos ? params.pos.userId : null,
        source: pos ? 'DASHBOARD' : 'CUSTOMER',
        origin: pos ? 'POS' : dineIn ? 'DINE_IN_QR' : 'STOREFRONT',
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

      const posAccepted = pos
        ? await acceptOrderInTransaction(tx, params.pos, {
            orderId: order.id,
            expectedVersion: 0,
          })
        : null;
      const posPayment =
        pos && posInput!.paidNow
          ? await confirmManualPaymentInTransaction(tx, params.pos, {
              orderId: order.id,
              expectedVersion: posAccepted!.version,
            })
          : null;

      if (posDraft?.status === 'OPEN') {
        const converted = await tx.posDraft.updateMany({
          where: {
            id: posDraft.id,
            tenantId: store.tenantId,
            storeId: store.id,
            status: 'OPEN',
            version: posDraft.version,
          },
          data: {
            status: 'CONVERTED',
            version: { increment: 1 },
            convertedOrderId: order.id,
            payloadCiphertext: '',
            payloadIv: '',
          },
        });
        if (converted.count !== 1) {
          throw new CheckoutError(
            'CART_INVALID',
            'Este pedido em espera foi alterado em outro terminal. Atualize a lista.',
            409,
          );
        }
      }

      return {
        id: order.id,
        storeId: store.id,
        publicToken: order.publicToken,
        orderNumber: order.orderNumber,
        paymentReportToken: order.paymentReportToken,
        created: true,
        outboxEventIds: [
          ...(outboxEvent ? [outboxEvent.id] : []),
          ...(posAccepted?.outboxEventIds ?? []),
          ...(posPayment?.outboxEventIds ?? []),
        ],
        customerNameConflict: persistedCustomer.nameConflict,
        rememberDeviceExpiresAt: remembered?.expiresAt ?? null,
        mercadoPagoPaymentId,
        onlinePayment,
        diningSessionPublicToken: diningSession?.publicToken ?? null,
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
      customerId: true,
      customerName: true,
      customerPhone: true,
      modality: true,
      diningTableId: true,
      diningTableLabelSnapshot: true,
      diningTableSession: {
        select: {
          publicToken: true,
          status: true,
          diningTable: { select: { label: true } },
          serviceRequests: {
            where: { status: 'OPEN' },
            select: { type: true },
          },
          store: { select: { entitlement: { select: { dineInQrEnabled: true } } } },
        },
      },
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
          entitlement: { select: { consumerIdentityEnabled: true } },
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

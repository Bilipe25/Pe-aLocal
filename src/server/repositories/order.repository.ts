import 'server-only';

import { getDb } from '@/server/database/client';
import type { CheckoutInput } from '@/schemas/checkout';
import * as orderAudit from '@/server/services/order-audit.service';
import { assertMatchingOrderFingerprint } from '@/server/services/order-idempotency.service';
import { appendOrderOutboxEvent } from '@/server/services/order-outbox.service';
import { normalizePhone } from '@/lib/brazil';
import { OrderPaymentConsistencyError } from '@/server/errors';

// =============================================================================
// Order Repository — Criação atômica de pedidos
// =============================================================================

interface CreateOrderParams {
  input: CheckoutInput;
  storeId: string;
  tenantId: string;
  /** Produtos reais do banco com preços recalculados */
  resolvedItems: ResolvedItem[];
  deliveryFee: number;
  deliveryZoneName: string | null;
  subtotal: number;
  total: number;
  idempotencyFingerprint: string;
}

export interface ResolvedItem {
  productId: string;
  productName: string;
  basePrice: number;
  quantity: number;
  notes: string;
  options: { id: string; name: string; price: number }[];
  /** unitPrice = basePrice + sum(options.price) */
  unitPrice: number;
  /** itemTotal = unitPrice * quantity */
  itemTotal: number;
}

interface CreateOrderResult {
  id: string;
  publicToken: string;
  orderNumber: number;
  paymentReportToken: string;
  created: boolean;
  outboxEventIds: string[];
}

/**
 * Cria um pedido completo em transação atômica:
 * Order + OrderItems + OrderItemOptions + Payment + OrderStatusHistory
 */
export async function createOrder(params: CreateOrderParams): Promise<CreateOrderResult> {
  const {
    input,
    storeId,
    tenantId,
    resolvedItems,
    deliveryFee,
    deliveryZoneName,
    subtotal,
    total,
    idempotencyFingerprint,
  } = params;

  return getDb().$transaction(async (tx) => {
    const idempotencyLockKey = `${storeId}:${input.idempotencyKey}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${idempotencyLockKey}, 0))`;

    // The lock makes concurrent retries wait for the first transaction to finish.
    const existing = await tx.order.findUnique({
      where: {
        storeId_idempotencyKey: {
          storeId,
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
        publicToken: existing.publicToken,
        orderNumber: existing.orderNumber,
        paymentReportToken: existing.paymentReportToken,
        created: false,
        outboxEventIds: [],
      };
    }

    // The database trigger assigns the next number for this store atomically.
    const order = await tx.order.create({
      data: {
        tenantId,
        storeId,
        idempotencyKey: input.idempotencyKey,
        idempotencyFingerprint,
        paymentReportToken: crypto.randomUUID(),
        paymentReportExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000),
        customerName: input.customerName,
        customerPhone: input.customerPhone,
        customerPhoneNormalized: normalizePhone(input.customerPhone),
        modality: input.modality,
        deliveryAddress: input.deliveryAddress ?? null,
        deliveryZoneName,
        subtotal,
        deliveryFee,
        discount: 0,
        total,
        paymentMethod: input.paymentMethod,
        changeFor: input.changeFor ?? null,
        status: 'PENDING',
        paymentStatus: 'PENDING',
        notes: input.notes || null,

        // Criar items aninhados
        items: {
          create: resolvedItems.map((item) => ({
            productId: item.productId,
            productName: item.productName,
            unitPrice: item.unitPrice,
            quantity: item.quantity,
            notes: item.notes || null,
            itemTotal: item.itemTotal,
            options: {
              create: item.options.map((opt) => ({
                optionId: opt.id,
                optionName: opt.name,
                optionPrice: opt.price,
              })),
            },
          })),
        },

        // Criar registro de pagamento
        payment: {
          create: {
            method: input.paymentMethod,
            status: 'PENDING',
            amount: total,
          },
        },

        // Criar histórico de status
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

    const auditLogId = await orderAudit.writeOrderCreatedAudit(tx, {
      tenantId,
      storeId,
      orderId: order.id,
      orderNumber: order.orderNumber,
    });
    const outboxEvent = await appendOrderOutboxEvent(tx, {
      tenantId,
      storeId,
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
      publicToken: order.publicToken,
      orderNumber: order.orderNumber,
      paymentReportToken: order.paymentReportToken,
      created: true,
      outboxEventIds: [outboxEvent.id],
    };
  });
}

/**
 * Busca um pedido pelo publicToken para exibição pública.
 */
export async function getOrderByPublicToken(publicToken: string) {
  return getDb().order.findUnique({
    where: { publicToken },
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

export async function getOrderTrackingStateByPublicToken(publicToken: string, storeSlug: string) {
  return getDb().order.findFirst({
    where: { publicToken, store: { slug: storeSlug } },
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

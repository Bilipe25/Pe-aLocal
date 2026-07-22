import 'server-only';

import { getDb } from '@/server/database/client';
import type { CheckoutInput } from '@/schemas/checkout';
import * as orderAudit from '@/server/services/order-audit.service';
import { normalizePhone } from '@/lib/brazil';

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
  created: boolean;
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
  } = params;

  return getDb().$transaction(async (tx) => {
    // 1. Checar idempotência — se já existe, retornar o existente
    const existing = await tx.order.findUnique({
      where: {
        storeId_idempotencyKey: {
          storeId,
          idempotencyKey: input.idempotencyKey,
        },
      },
      select: { id: true, publicToken: true, orderNumber: true },
    });

    if (existing) {
      return { ...existing, created: false };
    }

    // 2. Gerar orderNumber sequencial
    const lastOrder = await tx.order.findFirst({
      where: { storeId },
      orderBy: { orderNumber: 'desc' },
      select: { orderNumber: true },
    });
    const orderNumber = (lastOrder?.orderNumber ?? 0) + 1;

    // 3. Criar o pedido
    const order = await tx.order.create({
      data: {
        tenantId,
        storeId,
        orderNumber,
        idempotencyKey: input.idempotencyKey,
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
      },
    });

    await orderAudit.writeOrderCreatedAudit(tx, {
      tenantId,
      storeId,
      orderId: order.id,
      orderNumber: order.orderNumber,
    });

    return { ...order, created: true };
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
          whatsapp: true,
          settings: {
            select: {
              pixKeyType: true,
              pixKey: true,
              pixRecipient: true,
              pixBank: true,
              pixInstructions: true,
            },
          },
        },
      },
    },
  });
}

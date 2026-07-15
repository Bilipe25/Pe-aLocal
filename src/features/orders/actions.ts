'use server';

import { db } from '@/server/database/client';
import { checkoutSchema, type CheckoutInput } from '@/schemas/checkout';
import { createOrder, type ResolvedItem } from '@/server/repositories/order.repository';
import { actionSuccess, actionError } from '@/server/errors';
import type { ActionResult } from '@/server/errors';
import { BusinessRuleError } from '@/server/errors';

// =============================================================================
// Checkout — Server Action
// =============================================================================

interface CreateOrderData {
  publicToken: string;
  orderNumber: number;
}

/**
 * Cria um pedido a partir dos dados do checkout.
 *
 * ANTI-FRAUDE: Os preços são recalculados a partir do banco.
 * O carrinho envia apenas productId + optionIds + quantity.
 * Qualquer preço vindo do cliente é IGNORADO.
 */
export async function createOrderAction(
  storeSlug: string,
  rawInput: unknown,
): Promise<ActionResult<CreateOrderData>> {
  try {
    // 1. Validar input
    const parsed = checkoutSchema.safeParse(rawInput);
    if (!parsed.success) {
      return {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Dados do checkout inválidos',
          details: parsed.error.issues.map((i) => ({
            path: i.path.join('.'),
            message: i.message,
          })),
        },
      };
    }

    const input: CheckoutInput = parsed.data;

    // 2. Buscar loja pelo slug
    const store = await db.store.findUnique({
      where: { slug: storeSlug },
      select: {
        id: true,
        tenantId: true,
        status: true,
        isActive: true,
        settings: {
          select: {
            minOrderValue: true,
            deliveryEnabled: true,
            pickupEnabled: true,
            acceptsPix: true,
            acceptsCash: true,
            acceptsCardOnDelivery: true,
          },
        },
      },
    });

    if (!store || !store.isActive) {
      throw new BusinessRuleError('Loja não encontrada ou inativa');
    }

    if (store.status !== 'OPEN') {
      throw new BusinessRuleError('A loja está fechada no momento');
    }

    // 3. Validar modalidade
    const settings = store.settings;
    if (input.modality === 'DELIVERY' && !settings?.deliveryEnabled) {
      throw new BusinessRuleError('Esta loja não aceita delivery');
    }
    if (input.modality === 'PICKUP' && !settings?.pickupEnabled) {
      throw new BusinessRuleError('Esta loja não aceita retirada');
    }

    // 4. Validar forma de pagamento
    if (input.paymentMethod === 'PIX' && !settings?.acceptsPix) {
      throw new BusinessRuleError('Esta loja não aceita Pix');
    }
    if (input.paymentMethod === 'CASH' && !settings?.acceptsCash) {
      throw new BusinessRuleError('Esta loja não aceita dinheiro');
    }
    if (input.paymentMethod === 'CARD_ON_DELIVERY' && !settings?.acceptsCardOnDelivery) {
      throw new BusinessRuleError('Esta loja não aceita cartão na entrega');
    }

    // 5. Buscar produtos REAIS do banco
    const productIds = input.items.map((i) => i.productId);
    const products = await db.product.findMany({
      where: {
        id: { in: productIds },
        storeId: store.id,
        isAvailable: true,
        isSoldOut: false,
      },
      select: {
        id: true,
        name: true,
        basePrice: true,
        optionGroups: {
          where: { isActive: true },
          select: {
            options: {
              where: { isAvailable: true },
              select: { id: true, name: true, price: true },
            },
          },
        },
      },
    });

    const productMap = new Map(products.map((p) => [p.id, p]));

    // 6. Resolver items e recalcular preços
    const resolvedItems: ResolvedItem[] = [];

    for (const cartItem of input.items) {
      const product = productMap.get(cartItem.productId);
      if (!product) {
        throw new BusinessRuleError(
          `Produto "${cartItem.productId}" não está disponível`,
        );
      }

      // Buscar opções reais (flat de todos os groups)
      const allAvailableOptions = product.optionGroups.flatMap((g) => g.options);
      const optionMap = new Map(allAvailableOptions.map((o) => [o.id, o]));

      const resolvedOptions: { id: string; name: string; price: number }[] = [];
      for (const optionId of cartItem.optionIds) {
        const option = optionMap.get(optionId);
        if (!option) {
          throw new BusinessRuleError(
            `Adicional "${optionId}" não está disponível`,
          );
        }
        resolvedOptions.push({ id: option.id, name: option.name, price: option.price });
      }

      const optionsTotal = resolvedOptions.reduce((sum, o) => sum + o.price, 0);
      const unitPrice = product.basePrice + optionsTotal;
      const itemTotal = unitPrice * cartItem.quantity;

      resolvedItems.push({
        productId: product.id,
        productName: product.name,
        basePrice: product.basePrice,
        quantity: cartItem.quantity,
        notes: cartItem.notes ?? '',
        options: resolvedOptions,
        unitPrice,
        itemTotal,
      });
    }

    // 7. Calcular subtotal
    const subtotal = resolvedItems.reduce((sum, i) => sum + i.itemTotal, 0);

    // 8. Buscar taxa de entrega (se delivery)
    let deliveryFee = 0;
    let deliveryZoneName: string | null = null;

    if (input.modality === 'DELIVERY' && input.deliveryZoneId) {
      const zone = await db.deliveryZone.findFirst({
        where: {
          id: input.deliveryZoneId,
          storeId: store.id,
          isActive: true,
        },
        select: { fee: true, name: true, minOrderValue: true },
      });

      if (!zone) {
        throw new BusinessRuleError('Zona de entrega não encontrada');
      }

      if (zone.minOrderValue && subtotal < zone.minOrderValue) {
        throw new BusinessRuleError(
          `Pedido mínimo para esta zona é R$ ${(zone.minOrderValue / 100).toFixed(2)}`,
        );
      }

      deliveryFee = zone.fee;
      deliveryZoneName = zone.name;
    }

    // 9. Validar pedido mínimo geral
    if (settings?.minOrderValue && subtotal < settings.minOrderValue) {
      throw new BusinessRuleError(
        `Pedido mínimo é R$ ${(settings.minOrderValue / 100).toFixed(2)}`,
      );
    }

    // 10. Calcular total
    const total = subtotal + deliveryFee;

    // 11. Validar troco (se dinheiro)
    if (input.paymentMethod === 'CASH' && input.changeFor != null) {
      if (input.changeFor < total) {
        throw new BusinessRuleError('O valor do troco deve ser maior que o total do pedido');
      }
    }

    // 12. Criar pedido atomicamente
    const order = await createOrder({
      input,
      storeId: store.id,
      tenantId: store.tenantId,
      resolvedItems,
      deliveryFee,
      deliveryZoneName,
      subtotal,
      total,
    });

    return actionSuccess({
      publicToken: order.publicToken,
      orderNumber: order.orderNumber,
    });
  } catch (error) {
    return actionError(error);
  }
}

'use server';

import { getDb } from '@/server/database/client';
import { checkoutSchema, type CheckoutInput } from '@/schemas/checkout';
import { createOrder, type ResolvedItem } from '@/server/repositories/order.repository';
import { actionSuccess, actionError } from '@/server/errors';
import type { ActionResult } from '@/server/errors';
import { BusinessRuleError } from '@/server/errors';
import { triggerNewOrder } from '@/lib/pusher/server';
import { getRateLimiter, RATE_LIMITS } from '@/server/rate-limit';
import { getEffectiveStoreAvailabilityForTenant } from '@/server/services/store-availability.service';
import { validatePixKey } from '@/lib/brazil';
import { validateCartItems } from '@/lib/checkout/cart-validator';

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

    const rateLimit = await getRateLimiter().check({
      identifier: `order:${storeSlug}:${input.customerPhone}`,
      ...RATE_LIMITS.createOrder,
    });
    if (!rateLimit.allowed) {
      throw new BusinessRuleError('Muitos pedidos em sequência. Aguarde um minuto.');
    }

    // 2. Buscar loja pelo slug
    const store = await getDb().store.findUnique({
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
            pixKeyType: true,
            pixKey: true,
            acceptsCash: true,
            acceptsCardOnDelivery: true,
          },
        },
      },
    });

    if (!store) {
      throw new BusinessRuleError('Loja não encontrada');
    }

    const availability = await getEffectiveStoreAvailabilityForTenant(store.tenantId, store.id);
    if (!availability.acceptingOrders) {
      throw new BusinessRuleError(availability.reason, [
        {
          state: availability.state,
          nextTransitionAt: availability.nextTransitionAt?.toISOString() ?? null,
        },
      ]);
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
    if (input.paymentMethod === 'PIX') {
      if (!settings?.acceptsPix) {
        throw new BusinessRuleError('Esta loja não aceita Pix');
      }
      if (
        !settings.pixKeyType ||
        !settings.pixKey ||
        !validatePixKey(settings.pixKeyType, settings.pixKey)
      ) {
        throw new BusinessRuleError(
          'O Pix está temporariamente indisponível. Escolha outra forma de pagamento.',
        );
      }
    }
    if (input.paymentMethod === 'CASH' && !settings?.acceptsCash) {
      throw new BusinessRuleError('Esta loja não aceita dinheiro');
    }
    if (input.paymentMethod === 'CARD_ON_DELIVERY' && !settings?.acceptsCardOnDelivery) {
      throw new BusinessRuleError('Esta loja não aceita cartão na entrega');
    }

    // 5. Buscar produtos REAIS do banco (com regras de validação de adicionais)
    const productIds = input.items.map((i) => i.productId);
    const products = await getDb().product.findMany({
      where: {
        id: { in: productIds },
        storeId: store.id,
        archivedAt: null,
      },
      select: {
        id: true,
        name: true,
        basePrice: true,
        allowNotes: true,
        isAvailable: true,
        isSoldOut: true,
        archivedAt: true,
        category: { select: { isActive: true, archivedAt: true } },
        optionGroups: {
          where: { archivedAt: null },
          select: {
            id: true,
            title: true,
            isRequired: true,
            isMultiple: true,
            minSelections: true,
            maxSelections: true,
            isActive: true,
            archivedAt: true,
            options: {
              where: { archivedAt: null },
              select: { id: true, name: true, price: true, isAvailable: true, archivedAt: true },
            },
          },
        },
      },
    });

    // Verificar que a categoria do produto está ativa
    for (const product of products) {
      if (!product.category.isActive || product.category.archivedAt) {
        throw new BusinessRuleError(
          `O produto "${product.name}" não está disponível no momento.`,
        );
      }
    }

    const productMap = new Map(products.map((p) => [p.id, p]));

    // 6. Validar adicionais contra regras de negócio do servidor
    validateCartItems(
      productMap,
      input.items.map((i) => ({ productId: i.productId, optionIds: i.optionIds, notes: i.notes })),
    );

    // 7. Resolver items e recalcular preços
    const resolvedItems: ResolvedItem[] = [];

    for (const cartItem of input.items) {
      const product = productMap.get(cartItem.productId)!;

      // Buscar opções reais (flat de todos os groups ativos)
      const allAvailableOptions = product.optionGroups
        .filter((g) => g.isActive && !g.archivedAt)
        .flatMap((g) => g.options.filter((o) => o.isAvailable && !o.archivedAt));
      const optionMap = new Map(allAvailableOptions.map((o) => [o.id, o]));

      const resolvedOptions: { id: string; name: string; price: number }[] = [];
      for (const optionId of cartItem.optionIds) {
        const option = optionMap.get(optionId)!; // Já validado acima
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
        notes: (!product.allowNotes ? '' : (cartItem.notes ?? '')),
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
      const zone = await getDb().deliveryZone.findFirst({
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

    // Disparar evento Pusher para o painel em tempo real
    await triggerNewOrder(store.id, order.id, order.orderNumber);

    return actionSuccess({
      publicToken: order.publicToken,
      orderNumber: order.orderNumber,
    });
  } catch (error) {
    return actionError(error);
  }
}

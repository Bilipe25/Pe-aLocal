import 'server-only';

import { storeAssetUrl } from '@/features/assets/urls';
import { normalizePhone } from '@/lib/brazil';
import type { PosOrderInput, PosQuoteInput } from '@/schemas/pos';
import { getDb } from '@/server/database/client';
import { AuthorizationError, BusinessRuleError, CheckoutError } from '@/server/errors';
import { hasTenantPermission, Permission } from '@/server/permissions';
import { createOrder } from '@/server/repositories/order.repository';
import { getPublicDeliveryZones, getPublicOffers } from '@/server/queries/public-store';
import {
  calculateCheckoutQuote,
  applyAuthorizedPosManualDiscount,
  toPublicCheckoutQuote,
  type ResolvedSavedCheckoutAddress,
} from '@/server/services/checkout-quote.service';
import { getEffectiveStoreAvailabilityForTenant } from '@/server/services/store-availability.service';
import { requirePosContext, type PosContext } from '@/server/services/pos-context.service';
import { rebuildPosOrderInputFromDraft } from '@/server/services/pos-draft.service';
import { getPosOperationalOverview } from '@/server/services/pos-operations.service';

async function resolveQuoteAddress(context: PosContext, input: PosQuoteInput) {
  const addressId = input.deliveryAddress?.customerAddressId;
  if (!addressId) return null;
  if (!input.customerId) {
    throw new CheckoutError(
      'CART_INVALID',
      'Selecione o cliente vinculado ao endereço salvo.',
      422,
    );
  }
  const address = await getDb().customerAddress.findFirst({
    where: {
      id: addressId,
      tenantId: context.session.tenantId,
      ...(input.customerId ? { customerId: input.customerId } : {}),
    },
    select: {
      id: true,
      addressFingerprint: true,
      updatedAt: true,
      street: true,
      number: true,
      complement: true,
      neighborhood: true,
      city: true,
      state: true,
      zipCode: true,
      reference: true,
      storeUses: {
        where: { storeId: context.store.id },
        take: 1,
        select: { deliveryZoneId: true },
      },
    },
  });
  if (!address) throw new CheckoutError('CART_INVALID', 'O endereço selecionado não existe.', 422);
  return {
    id: address.id,
    addressFingerprint: address.addressFingerprint,
    updatedAt: address.updatedAt,
    street: address.street,
    number: address.number,
    complement: address.complement,
    neighborhood: address.neighborhood,
    city: address.city,
    state: address.state,
    zipCode: address.zipCode,
    reference: address.reference,
    mappedDeliveryZoneId:
      address.storeUses[0]?.deliveryZoneId ?? input.deliveryAddress?.deliveryZoneId ?? null,
  } satisfies ResolvedSavedCheckoutAddress;
}

async function resolveQuoteTable(context: PosContext, input: PosQuoteInput) {
  if (input.modality !== 'DINE_IN' || !input.diningTableId) return null;
  if (!context.store.entitlement?.dineInQrEnabled) {
    throw new BusinessRuleError(
      'A modalidade Mesa exige que o recurso de salão esteja habilitado.',
    );
  }
  const table = await getDb().storeDiningTable.findFirst({
    where: {
      id: input.diningTableId,
      tenantId: context.session.tenantId,
      storeId: context.store.id,
    },
    select: { id: true, tenantId: true, storeId: true, label: true, version: true, isActive: true },
  });
  if (!table?.isActive) throw new BusinessRuleError('A mesa selecionada não está ativa.');
  return table;
}

export async function calculatePosQuote(input: PosQuoteInput) {
  const context = await requirePosContext();
  if (
    input.manualDiscount &&
    !hasTenantPermission(context.session.tenantRole, Permission.APPLY_POS_MANUAL_DISCOUNT)
  ) {
    throw new AuthorizationError('Seu perfil não pode aplicar desconto manual.');
  }
  const [savedAddress, diningTable, availability] = await Promise.all([
    resolveQuoteAddress(context, input),
    resolveQuoteTable(context, input),
    getEffectiveStoreAvailabilityForTenant(context.session.tenantId, context.store.id),
  ]);
  const quoteInput =
    input.modality === 'DINE_IN'
      ? { modality: 'DINE_IN' as const, items: input.items, couponCode: input.couponCode }
      : {
          modality: input.modality,
          items: input.items,
          couponCode: input.couponCode,
          deliveryZoneId: input.deliveryAddress?.deliveryZoneId,
          deliveryPostalCode: input.deliveryAddress?.postalCode,
          deliveryAddress: input.deliveryAddress
            ? {
                postalCode: input.deliveryAddress.postalCode,
                street: input.deliveryAddress.street,
                number: input.deliveryAddress.number,
                complement: input.deliveryAddress.complement,
                reference: input.deliveryAddress.reference,
              }
            : undefined,
        };
  const baseQuote = await calculateCheckoutQuote(context.store.slug, quoteInput, {
    channel: 'POS',
    savedAddress,
    diningTable,
  });
  if (!baseQuote) throw new BusinessRuleError('A loja ativa não está disponível.');
  const quote = applyAuthorizedPosManualDiscount(baseQuote, input.manualDiscount);
  return {
    quote: toPublicCheckoutQuote(quote),
    availabilityWarning:
      availability.state === 'CLOSED_BY_SCHEDULE' || availability.state === 'MANUALLY_CLOSED'
        ? availability.reason
        : null,
  };
}

export async function createPosOrder(input: PosOrderInput) {
  const context = await requirePosContext();
  const orderInput = await rebuildPosOrderInputFromDraft(context, input);
  if (
    orderInput.manualDiscount &&
    !hasTenantPermission(context.session.tenantRole, Permission.APPLY_POS_MANUAL_DISCOUNT)
  ) {
    throw new AuthorizationError('Seu perfil não pode aplicar desconto manual.');
  }
  if (
    orderInput.modality === 'DINE_IN' &&
    (!context.store.entitlement?.dineInQrEnabled ||
      !hasTenantPermission(context.session.tenantRole, Permission.OPERATE_DINING_ROOM))
  ) {
    throw new AuthorizationError('Seu perfil não pode criar pedidos para mesas.');
  }
  if (
    orderInput.paidNow &&
    !hasTenantPermission(context.session.tenantRole, Permission.CONFIRM_MANUAL_PAYMENT)
  ) {
    throw new AuthorizationError('Seu perfil não pode confirmar pagamentos manuais.');
  }
  if (
    orderInput.modality === 'DELIVERY' &&
    orderInput.paidNow &&
    orderInput.paymentMethod !== 'PIX'
  ) {
    throw new BusinessRuleError(
      'No Delivery, somente o Pix manual pode ser marcado como pago agora.',
    );
  }

  console.info('[POS_ORDER_CREATE_STARTED]', {
    storeId: context.store.id,
    userId: context.session.userId,
    modality: orderInput.modality,
    itemCount: orderInput.items.length,
  });
  try {
    const result = await createOrder({
      input: orderInput,
      pos: {
        tenantId: context.session.tenantId,
        storeId: context.store.id,
        userId: context.session.userId,
        userName: context.session.name,
        canConfirmPayment: hasTenantPermission(
          context.session.tenantRole,
          Permission.CONFIRM_MANUAL_PAYMENT,
        ),
        canRefundPayment: false,
      },
    });
    console.info('[POS_ORDER_CREATED]', {
      storeId: context.store.id,
      orderId: result.id,
      orderNumber: result.orderNumber,
      created: result.created,
    });
    return result;
  } catch (error) {
    console.error('[POS_ORDER_CREATE_FAILED]', {
      storeId: context.store.id,
      userId: context.session.userId,
      error: error instanceof Error ? error.name : 'unknown',
    });
    throw error;
  }
}

export async function lookupPosCustomerByPhone(phone: string) {
  const context = await requirePosContext();
  if (!hasTenantPermission(context.session.tenantRole, Permission.VIEW_CUSTOMER_CONTACT)) {
    throw new AuthorizationError('Seu perfil não pode consultar dados de clientes.');
  }
  const phoneNormalized = normalizePhone(phone);
  if (!/^55\d{10,11}$/.test(phoneNormalized)) {
    throw new BusinessRuleError('Informe um telefone brasileiro completo.');
  }
  const customer = await getDb().customer.findUnique({
    where: {
      tenantId_phoneNormalized: { tenantId: context.session.tenantId, phoneNormalized },
    },
    select: {
      id: true,
      name: true,
      phone: true,
      addresses: {
        orderBy: [{ isDefault: 'desc' }, { lastUsedAt: 'desc' }, { updatedAt: 'desc' }],
        take: 5,
        select: {
          id: true,
          label: true,
          street: true,
          number: true,
          complement: true,
          neighborhood: true,
          city: true,
          state: true,
          zipCode: true,
          reference: true,
          storeUses: {
            where: { storeId: context.store.id },
            take: 1,
            select: { deliveryZoneId: true },
          },
        },
      },
    },
  });
  return customer
    ? {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        addresses: customer.addresses.map((address) => {
          const { storeUses, ...value } = address;
          return {
            ...value,
            deliveryZoneId: storeUses[0]?.deliveryZoneId ?? null,
          };
        }),
      }
    : null;
}

export async function getPosWorkspace() {
  const context = await requirePosContext();
  const [categories, products, offers, deliveryZones, tables, settings, availability, operations] =
    await Promise.all([
      getDb().category.findMany({
        where: {
          tenantId: context.session.tenantId,
          storeId: context.store.id,
          isActive: true,
          archivedAt: null,
        },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: { id: true, name: true },
      }),
      getDb().product.findMany({
        where: {
          tenantId: context.session.tenantId,
          storeId: context.store.id,
          archivedAt: null,
        },
        orderBy: [{ category: { sortOrder: 'asc' } }, { sortOrder: 'asc' }, { name: 'asc' }],
        select: {
          id: true,
          categoryId: true,
          name: true,
          description: true,
          basePrice: true,
          imageUrl: true,
          imageAssetId: true,
          isAvailable: true,
          isSoldOut: true,
          allowNotes: true,
          optionGroups: {
            where: { isActive: true, archivedAt: null },
            orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
            select: {
              id: true,
              title: true,
              description: true,
              isRequired: true,
              isMultiple: true,
              minSelections: true,
              maxSelections: true,
              options: {
                where: { isAvailable: true, archivedAt: null },
                orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
                select: { id: true, name: true, price: true },
              },
            },
          },
        },
      }),
      getPublicOffers(context.store.id, context.session.tenantId, context.store.timeZone),
      getPublicDeliveryZones(context.store.id),
      context.store.entitlement?.dineInQrEnabled
        ? getDb().storeDiningTable.findMany({
            where: {
              tenantId: context.session.tenantId,
              storeId: context.store.id,
              isActive: true,
            },
            orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
            select: {
              id: true,
              label: true,
              sessions: {
                where: { status: 'OPEN' },
                take: 1,
                select: { id: true, openedAt: true },
              },
            },
          })
        : Promise.resolve([]),
      getDb().storeSettings.findUnique({
        where: { storeId: context.store.id },
        select: {
          deliveryEnabled: true,
          pickupEnabled: true,
          acceptsPix: true,
          pixKey: true,
          pixKeyType: true,
          acceptsCash: true,
          acceptsCardOnDelivery: true,
          acceptsCardInPerson: true,
        },
      }),
      getEffectiveStoreAvailabilityForTenant(context.session.tenantId, context.store.id),
      getPosOperationalOverview(context),
    ]);

  return {
    store: { id: context.store.id, name: context.store.name, slug: context.store.slug },
    capabilities: {
      canLookupCustomer: hasTenantPermission(
        context.session.tenantRole,
        Permission.VIEW_CUSTOMER_CONTACT,
      ),
      canConfirmPayment: hasTenantPermission(
        context.session.tenantRole,
        Permission.CONFIRM_MANUAL_PAYMENT,
      ),
      canUseDiningRoom: Boolean(
        context.store.entitlement?.dineInQrEnabled &&
        hasTenantPermission(context.session.tenantRole, Permission.OPERATE_DINING_ROOM),
      ),
      canManagePosShortcuts: hasTenantPermission(
        context.session.tenantRole,
        Permission.MANAGE_POS_SHORTCUTS,
      ),
      canManagePosTerminals: hasTenantPermission(
        context.session.tenantRole,
        Permission.MANAGE_POS_TERMINALS,
      ),
      canApplyManualDiscount: hasTenantPermission(
        context.session.tenantRole,
        Permission.APPLY_POS_MANUAL_DISCOUNT,
      ),
    },
    availability: {
      state: availability.state,
      reason: availability.reason,
      blocksPos:
        !availability.acceptingOrders &&
        availability.state !== 'CLOSED_BY_SCHEDULE' &&
        availability.state !== 'MANUALLY_CLOSED',
    },
    categories,
    products: products.map((product) => ({
      ...product,
      imageUrl: product.imageAssetId ? storeAssetUrl(product.imageAssetId, 384) : product.imageUrl,
    })),
    offers,
    deliveryZones,
    tables: tables.map((table) => ({
      id: table.id,
      label: table.label,
      session: table.sessions[0] ?? null,
    })),
    settings,
    operations,
  };
}

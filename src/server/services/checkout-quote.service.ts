import 'server-only';

import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';

import { storeAssetUrl } from '@/features/assets/urls';
import { validateCartItem } from '@/lib/checkout/cart-validator';
import {
  MAX_POSTGRES_INTEGER_CENTS,
  type CheckoutInput,
  type CheckoutQuoteInput,
} from '@/schemas/checkout';
import { getDb } from '@/server/database/client';
import { CheckoutError, DomainError } from '@/server/errors';
import { getEffectiveStoreAvailabilityForTenant } from '@/server/services/store-availability.service';
import type {
  CheckoutQuoteDto,
  CheckoutQuoteIssueDto,
  CheckoutQuoteLineDto,
} from '@/types/storefront';

type QuoteClient = Pick<
  Prisma.TransactionClient,
  'store' | 'product' | 'deliveryZone' | 'deliveryZonePostalRange' | 'coupon'
>;

export interface ResolvedSavedCheckoutAddress {
  id: string;
  addressFingerprint: string;
  updatedAt: Date;
  street: string;
  number: string;
  complement: string | null;
  neighborhood: string;
  city: string;
  state: string;
  zipCode: string | null;
  reference: string | null;
  mappedDeliveryZoneId: string | null;
}

export interface ResolvedCheckoutQuote extends CheckoutQuoteDto {
  tenantId: string;
  couponId: string | null;
  estimatedMinMinutes: number;
  estimatedMaxMinutes: number;
}

type CheckoutQuoteCalculationInput = CheckoutQuoteInput & {
  deliveryAddress?: CheckoutInput['deliveryAddress'];
};

function safeAdd(left: number, right: number) {
  const result = left + right;
  if (
    left < 0 ||
    right < 0 ||
    !Number.isSafeInteger(result) ||
    result > MAX_POSTGRES_INTEGER_CENTS
  ) {
    throw new CheckoutError(
      'CART_INVALID',
      'O valor do carrinho excede o limite permitido. Revise as quantidades.',
    );
  }
  return result;
}

function safeMultiply(left: number, right: number) {
  const result = left * right;
  if (
    left < 0 ||
    right < 0 ||
    !Number.isSafeInteger(result) ||
    result > MAX_POSTGRES_INTEGER_CENTS
  ) {
    throw new CheckoutError(
      'CART_INVALID',
      'O valor do carrinho excede o limite permitido. Revise as quantidades.',
    );
  }
  return result;
}

const DEFAULT_ESTIMATED_MIN_MINUTES = 30;
const DEFAULT_ESTIMATED_MAX_MINUTES = 50;
const MAX_ESTIMATED_TIME_MINUTES = 1440;
const legacyEstimatedTimePattern =
  /^\s*([1-9]\d{0,3})(?:\s*[-\u2013]\s*([1-9]\d{0,3}))?\s*(?:min(?:uto)?s?)?\s*$/i;

function isSafeEstimatedMinute(value: number) {
  return Number.isSafeInteger(value) && value >= 1 && value <= MAX_ESTIMATED_TIME_MINUTES;
}

function safeEstimatedFallback(fallbackMin: number, fallbackMax: number) {
  const min = isSafeEstimatedMinute(fallbackMin) ? fallbackMin : DEFAULT_ESTIMATED_MIN_MINUTES;
  const max =
    isSafeEstimatedMinute(fallbackMax) && fallbackMax >= min
      ? fallbackMax
      : Math.max(min, DEFAULT_ESTIMATED_MAX_MINUTES);
  return { min, max };
}

function parseEstimatedRange(value: string | null, fallbackMin: number, fallbackMax: number) {
  const fallback = safeEstimatedFallback(fallbackMin, fallbackMax);
  if (!value) return fallback;

  const match = legacyEstimatedTimePattern.exec(value);
  if (!match) return fallback;

  const min = Number(match[1]);
  const max = Number(match[2] ?? match[1]);
  if (!isSafeEstimatedMinute(min) || !isSafeEstimatedMinute(max) || max < min) {
    return fallback;
  }
  return { min, max };
}

function addMinutes(value: Date, minutes: number) {
  return new Date(value.getTime() + Math.max(0, minutes) * 60_000);
}

function quoteFingerprint(input: {
  storeId: string;
  modality: CheckoutQuoteInput['modality'];
  postalCode: string | null;
  lines: CheckoutQuoteLineDto[];
  subtotal: number;
  discount: number;
  deliveryFee: number;
  total: number;
  deliveryZoneId: string | null;
  deliveryAddressVersion: string | null;
  couponCode: string | null;
  issues: CheckoutQuoteIssueDto[];
  estimatedMinMinutes: number;
  estimatedMaxMinutes: number;
}) {
  return createHash('sha256')
    .update(
      JSON.stringify({
        ...input,
        lines: input.lines.map((line) => ({
          lineId: line.lineId,
          productId: line.productId,
          productName: line.productName,
          quantity: line.quantity,
          notes: line.notes,
          options: line.options.map((option) => ({
            id: option.id,
            name: option.name,
            price: option.price,
            position: option.position,
            groupId: option.groupId,
            groupName: option.groupName,
            groupPosition: option.groupPosition,
          })),
          unitPrice: line.unitPrice,
          itemTotal: line.itemTotal,
        })),
        issues: input.issues
          .map((issue) => ({
            code: issue.code,
            message: issue.message,
            lineId: issue.lineId ?? null,
          }))
          .sort((left, right) =>
            `${left.lineId}:${left.code}`.localeCompare(`${right.lineId}:${right.code}`),
          ),
      }),
    )
    .digest('hex');
}

function issueFromError(error: unknown, lineId: string): CheckoutQuoteIssueDto {
  if (error instanceof DomainError) {
    return { code: 'CART_INVALID', message: error.message, lineId };
  }
  return {
    code: 'CART_INVALID',
    message: 'Não foi possível validar este item. Remova-o e adicione novamente.',
    lineId,
  };
}

export async function calculateCheckoutQuote(
  storeSlug: string,
  input: CheckoutQuoteCalculationInput,
  options: {
    client?: QuoteClient;
    now?: Date;
    savedAddress?: ResolvedSavedCheckoutAddress | null;
  } = {},
): Promise<ResolvedCheckoutQuote | null> {
  const client = options.client ?? getDb();
  const now = options.now ?? new Date();
  const store = await client.store.findUnique({
    where: { slug: storeSlug },
    select: {
      id: true,
      tenantId: true,
      slug: true,
      address: { select: { city: true, state: true } },
      settings: {
        select: {
          minOrderValue: true,
          estimatedTimeMinMinutes: true,
          estimatedTimeMaxMinutes: true,
          deliveryEnabled: true,
          pickupEnabled: true,
        },
      },
    },
  });
  if (!store) return null;

  const issues: CheckoutQuoteIssueDto[] = [];
  const availability = await getEffectiveStoreAvailabilityForTenant(store.tenantId, store.id, {
    now,
    client,
  });
  if (!availability.acceptingOrders) {
    issues.push({ code: 'STORE_UNAVAILABLE', message: availability.reason });
  }

  if (!store.settings) {
    issues.push({
      code: 'STORE_UNAVAILABLE',
      message: 'A loja ainda não configurou as opções de pedido.',
    });
  } else if (input.modality === 'DELIVERY' && !store.settings.deliveryEnabled) {
    issues.push({
      code: 'STORE_UNAVAILABLE',
      message: 'A entrega não está disponível nesta loja.',
    });
  } else if (input.modality === 'PICKUP' && !store.settings.pickupEnabled) {
    issues.push({
      code: 'STORE_UNAVAILABLE',
      message: 'A retirada não está disponível nesta loja.',
    });
  }

  const productIds = [...new Set(input.items.map((item) => item.productId))];
  const products = await client.product.findMany({
    where: {
      id: { in: productIds },
      tenantId: store.tenantId,
      storeId: store.id,
      archivedAt: null,
    },
    select: {
      id: true,
      name: true,
      basePrice: true,
      imageUrl: true,
      imageAssetId: true,
      allowNotes: true,
      isAvailable: true,
      isSoldOut: true,
      archivedAt: true,
      category: { select: { isActive: true, archivedAt: true } },
      optionGroups: {
        where: { archivedAt: null },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          title: true,
          sortOrder: true,
          isRequired: true,
          isMultiple: true,
          minSelections: true,
          maxSelections: true,
          isActive: true,
          archivedAt: true,
          options: {
            where: { archivedAt: null },
            orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
            select: {
              id: true,
              name: true,
              price: true,
              sortOrder: true,
              isAvailable: true,
              archivedAt: true,
            },
          },
        },
      },
    },
  });
  const productMap = new Map(products.map((product) => [product.id, product]));
  const semanticLines = new Set<string>();
  const lines: CheckoutQuoteLineDto[] = [];
  let subtotal = 0;

  for (const item of input.items) {
    const product = productMap.get(item.productId);
    if (
      !product ||
      !product.category.isActive ||
      product.category.archivedAt ||
      !product.isAvailable ||
      product.isSoldOut
    ) {
      issues.push({
        code: 'PRODUCT_UNAVAILABLE',
        message: product
          ? `${product.name} não está disponível no momento.`
          : 'Um produto do carrinho não está mais disponível.',
        lineId: item.lineId,
      });
      continue;
    }

    const semanticFingerprint = JSON.stringify({
      productId: item.productId,
      optionIds: [...item.optionIds].sort(),
      notes: item.notes,
    });
    if (semanticLines.has(semanticFingerprint)) {
      issues.push({
        code: 'CART_INVALID',
        message: `${product.name} aparece em linhas repetidas. Una as quantidades para continuar.`,
        lineId: item.lineId,
      });
      continue;
    }
    semanticLines.add(semanticFingerprint);

    try {
      validateCartItem(product, item);
    } catch (error) {
      issues.push(issueFromError(error, item.lineId));
      continue;
    }

    const optionMap = new Map(
      product.optionGroups
        .filter((group) => group.isActive && !group.archivedAt)
        .flatMap((group) =>
          group.options
            .filter((option) => option.isAvailable && !option.archivedAt)
            .map(
              (option) =>
                [
                  option.id,
                  {
                    ...option,
                    groupId: group.id,
                    groupName: group.title,
                    groupPosition: group.sortOrder,
                  },
                ] as const,
            ),
        ),
    );
    const resolvedOptions = item.optionIds
      .map((optionId) => optionMap.get(optionId)!)
      .sort(
        (left, right) =>
          left.groupPosition - right.groupPosition ||
          left.groupId.localeCompare(right.groupId) ||
          left.sortOrder - right.sortOrder ||
          left.id.localeCompare(right.id),
      );
    const optionsTotal = resolvedOptions.reduce((sum, option) => safeAdd(sum, option.price), 0);
    const unitPrice = safeAdd(product.basePrice, optionsTotal);
    const itemTotal = safeMultiply(unitPrice, item.quantity);
    subtotal = safeAdd(subtotal, itemTotal);
    lines.push({
      lineId: item.lineId,
      productId: product.id,
      productName: product.name,
      imageUrl: product.imageAssetId ? storeAssetUrl(product.imageAssetId, 192) : product.imageUrl,
      imageAssetId: product.imageAssetId,
      quantity: item.quantity,
      notes: product.allowNotes ? item.notes : '',
      options: resolvedOptions.map((option, position) => ({
        id: option.id,
        name: option.name,
        price: option.price,
        position,
        groupId: option.groupId,
        groupName: option.groupName,
        groupPosition: option.groupPosition,
      })),
      unitPrice,
      itemTotal,
    });
  }

  let deliveryFee = 0;
  let deliveryZoneId: string | null = null;
  let deliveryZoneName: string | null = null;
  let zoneMinOrderValue = 0;
  let estimatedMinMinutes = store.settings?.estimatedTimeMinMinutes ?? 30;
  let estimatedMaxMinutes = store.settings?.estimatedTimeMaxMinutes ?? 50;
  const savedAddress = options.savedAddress ?? null;
  const savedAddressPostalCodeDigits = savedAddress?.zipCode?.replace(/\D/g, '') || null;
  const savedAddressPostalCode =
    savedAddressPostalCodeDigits && /^\d{8}$/.test(savedAddressPostalCodeDigits)
      ? savedAddressPostalCodeDigits
      : null;
  const manualAddressPostalCode = input.deliveryAddress?.postalCode ?? null;
  const effectivePostalCode =
    savedAddressPostalCode ?? manualAddressPostalCode ?? input.deliveryPostalCode ?? null;
  const deliveryAddressVersion = savedAddress
    ? `${savedAddress.addressFingerprint}:${savedAddress.updatedAt.toISOString()}`
    : null;

  if (input.modality === 'DELIVERY') {
    if (!store.address) {
      issues.push({
        code: 'STORE_UNAVAILABLE',
        message: 'A loja ainda não configurou a cidade atendida para entrega.',
      });
    }
    if (input.savedAddressReference && !savedAddress) {
      issues.push({
        code: 'SAVED_ADDRESS_UNAVAILABLE',
        message: 'Este endereço não está mais disponível. Informe um novo endereço para continuar.',
      });
    }
    if (savedAddress?.zipCode && !savedAddressPostalCode) {
      issues.push({
        code: 'SAVED_ADDRESS_UNAVAILABLE',
        message: 'Este endereço não está mais disponível. Informe um novo endereço para continuar.',
      });
    }

    if (
      savedAddress &&
      store.address &&
      (savedAddress.city.localeCompare(store.address.city, 'pt-BR', { sensitivity: 'base' }) !==
        0 ||
        savedAddress.state.toUpperCase() !== store.address.state.toUpperCase())
    ) {
      issues.push({
        code: 'OUTSIDE_DELIVERY_AREA',
        message: 'Este endereço não pertence à cidade atendida por esta loja.',
      });
    }

    if (
      savedAddress?.mappedDeliveryZoneId &&
      input.deliveryZoneId &&
      input.deliveryZoneId !== savedAddress.mappedDeliveryZoneId
    ) {
      issues.push({
        code: 'SAVED_ADDRESS_UNAVAILABLE',
        message: 'Este endereço não está mais disponível. Informe um novo endereço para continuar.',
      });
    }

    const requestedZoneId = savedAddress?.mappedDeliveryZoneId ?? input.deliveryZoneId ?? null;
    let zone:
      | {
          id: string;
          name: string;
          fee: number;
          minOrderValue: number | null;
          estimatedTime: string | null;
        }
      | undefined;

    if (requestedZoneId) {
      const selectedZone = await client.deliveryZone.findFirst({
        where: {
          id: requestedZoneId,
          tenantId: store.tenantId,
          storeId: store.id,
          isActive: true,
          postalRanges: { some: { isActive: true } },
        },
        select: {
          id: true,
          name: true,
          fee: true,
          minOrderValue: true,
          estimatedTime: true,
        },
      });
      if (!selectedZone) {
        issues.push({
          code: 'OUTSIDE_DELIVERY_AREA',
          message: 'A região escolhida não está disponível para entrega.',
        });
      } else {
        const matchingPostalRange = effectivePostalCode
          ? await client.deliveryZonePostalRange.count({
              where: {
                deliveryZoneId: selectedZone.id,
                tenantId: store.tenantId,
                storeId: store.id,
                isActive: true,
                postalCodeStart: { lte: effectivePostalCode },
                postalCodeEnd: { gte: effectivePostalCode },
              },
            })
          : 1;
        if (matchingPostalRange === 0) {
          issues.push({
            code: 'OUTSIDE_DELIVERY_AREA',
            message: 'O CEP informado não pertence à região escolhida.',
          });
        } else {
          zone = selectedZone;
        }
      }
    } else if (effectivePostalCode) {
      const matchingZones = await client.deliveryZone.findMany({
        where: {
          tenantId: store.tenantId,
          storeId: store.id,
          isActive: true,
          postalRanges: {
            some: {
              isActive: true,
              postalCodeStart: { lte: effectivePostalCode },
              postalCodeEnd: { gte: effectivePostalCode },
            },
          },
        },
        select: {
          id: true,
          name: true,
          fee: true,
          minOrderValue: true,
          estimatedTime: true,
        },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        take: 2,
      });
      if (matchingZones.length === 1) {
        zone = matchingZones[0];
      } else {
        issues.push({
          code: matchingZones.length === 0 ? 'OUTSIDE_DELIVERY_AREA' : 'CART_INVALID',
          message:
            matchingZones.length === 0
              ? 'Este CEP ainda não está na área de entrega da loja.'
              : 'A cobertura de entrega está em atualização. Escolha retirada ou tente mais tarde.',
        });
      }
    } else {
      issues.push({
        code: 'DELIVERY_ZONE_REQUIRED',
        message: 'Escolha uma região atendida para calcular a entrega.',
      });
    }

    if (zone) {
      deliveryZoneId = zone.id;
      deliveryZoneName = zone.name;
      deliveryFee = zone.fee;
      zoneMinOrderValue = zone.minOrderValue ?? 0;
      const estimated = parseEstimatedRange(
        zone.estimatedTime,
        estimatedMinMinutes,
        estimatedMaxMinutes,
      );
      estimatedMinMinutes = estimated.min;
      estimatedMaxMinutes = estimated.max;
    }
  }

  const minOrderValue = Math.max(store.settings?.minOrderValue ?? 0, zoneMinOrderValue);
  const missingForMinimum = Math.max(0, minOrderValue - subtotal);
  if (missingForMinimum > 0) {
    issues.push({
      code: 'MIN_ORDER_NOT_REACHED',
      message: 'Adicione mais itens para atingir o pedido mínimo.',
    });
  }

  let couponId: string | null = null;
  let coupon: CheckoutQuoteDto['coupon'] = null;
  let discount = 0;
  if (input.couponCode) {
    const candidate = await client.coupon.findFirst({
      where: {
        tenantId: store.tenantId,
        storeId: store.id,
        code: input.couponCode,
      },
      select: {
        id: true,
        code: true,
        type: true,
        value: true,
        minOrderValue: true,
        maxDiscount: true,
        maxUsages: true,
        usageCount: true,
        isActive: true,
        startsAt: true,
        expiresAt: true,
        _count: {
          select: {
            reservations: { where: { status: 'ACTIVE', expiresAt: { gt: now } } },
          },
        },
      },
    });
    const invalid =
      !candidate ||
      !candidate.isActive ||
      (candidate.startsAt != null && candidate.startsAt > now) ||
      (candidate.expiresAt != null && candidate.expiresAt <= now) ||
      (candidate.maxUsages != null &&
        candidate.usageCount + candidate._count.reservations >= candidate.maxUsages) ||
      (candidate.minOrderValue != null && subtotal < candidate.minOrderValue);
    if (invalid || !candidate) {
      issues.push({
        code: 'COUPON_INVALID',
        message: 'Este cupom não está disponível para este pedido.',
      });
    } else {
      const calculated =
        candidate.type === 'PERCENTAGE'
          ? Math.floor((subtotal * candidate.value) / 100)
          : candidate.value;
      discount = Math.min(subtotal, candidate.maxDiscount ?? calculated, calculated);
      couponId = candidate.id;
      coupon = { code: candidate.code, discount };
    }
  }

  const total = safeAdd(subtotal - discount, deliveryFee);
  const fingerprint = quoteFingerprint({
    storeId: store.id,
    modality: input.modality,
    postalCode: effectivePostalCode,
    lines,
    subtotal,
    discount,
    deliveryFee,
    total,
    deliveryZoneId,
    deliveryAddressVersion,
    couponCode: coupon?.code ?? null,
    issues,
    estimatedMinMinutes,
    estimatedMaxMinutes,
  });

  return {
    quoteFingerprint: fingerprint,
    storeId: store.id,
    storeSlug: store.slug,
    tenantId: store.tenantId,
    lines,
    subtotal,
    discount,
    deliveryFee,
    total,
    minOrderValue,
    missingForMinimum,
    deliveryZoneId,
    deliveryZoneName,
    promisedFulfillmentMinAt: addMinutes(now, estimatedMinMinutes).toISOString(),
    promisedFulfillmentMaxAt: addMinutes(now, estimatedMaxMinutes).toISOString(),
    coupon,
    couponId,
    issues,
    canCheckout: issues.length === 0,
    estimatedMinMinutes,
    estimatedMaxMinutes,
  };
}

export function toPublicCheckoutQuote(quote: ResolvedCheckoutQuote): CheckoutQuoteDto {
  const { tenantId: _tenantId, couponId: _couponId, ...publicQuote } = quote;
  void _tenantId;
  void _couponId;
  return publicQuote;
}

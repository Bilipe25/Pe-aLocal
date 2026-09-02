import 'server-only';

import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';

import { storeAssetUrl } from '@/features/assets/urls';
import { isOfferScheduleActive } from '@/domain/offers/schedule';
import {
  addCents,
  assertCheckoutFinancialInvariants,
  MoneyArithmeticError,
  multiplyCents,
} from '@/domain/money';
import { validateCartItem } from '@/lib/checkout/cart-validator';
import {
  MAX_CHECKOUT_TOTAL_UNITS,
  type CheckoutInput,
  type CheckoutQuoteInput,
  type DineInCheckoutQuoteInput,
} from '@/schemas/checkout';
import type { PosManualDiscountInput } from '@/schemas/pos';
import { getDb } from '@/server/database/client';
import { CheckoutError, DomainError } from '@/server/errors';
import { getEffectiveStoreAvailabilityForTenant } from '@/server/services/store-availability.service';
import type {
  CheckoutLoyaltyBenefitDto,
  CheckoutQuoteDto,
  CheckoutQuoteAdjustmentDto,
  CheckoutQuoteIssueDto,
  CheckoutQuoteLineDto,
  CheckoutQuoteOfferGroupDto,
} from '@/types/storefront';

export interface AuthorizedLoyaltyReward {
  id: string;
  rewardType: 'FIXED_DISCOUNT' | 'PERCENT_DISCOUNT' | 'FREE_PRODUCT';
  value: number | null;
  percentageBasisPoints: number | null;
  maximumDiscountValue: number | null;
  freeProductId: string | null;
  freeProductNameSnapshot: string | null;
  freeProductBaseValue: number | null;
  minimumOrderValue: number;
  expiresAt: Date | null;
  createdAt: Date;
  freeProductState?: 'AVAILABLE' | 'SOLD_OUT' | 'ARCHIVED';
}

interface LegacyAuthorizedLoyaltyReward {
  id: string;
  value: number;
  minimumOrderValue: number;
}

function normalizeAuthorizedLoyaltyReward(
  reward: AuthorizedLoyaltyReward | LegacyAuthorizedLoyaltyReward,
): AuthorizedLoyaltyReward {
  if ('rewardType' in reward) return reward;
  return {
    ...reward,
    rewardType: 'FIXED_DISCOUNT',
    percentageBasisPoints: null,
    maximumDiscountValue: null,
    freeProductId: null,
    freeProductNameSnapshot: null,
    freeProductBaseValue: null,
    expiresAt: null,
    createdAt: new Date(0),
  };
}

type QuoteClient = Pick<
  Prisma.TransactionClient,
  | 'store'
  | 'product'
  | 'storeCombo'
  | 'storeProductPromotion'
  | 'storeOffer'
  | 'deliveryZone'
  | 'deliveryZonePostalRange'
  | 'coupon'
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
  automaticDiscount: number;
  couponDiscount: number;
  manualDiscount: number;
  loyaltyDiscount?: number;
  adjustments: CheckoutQuoteAdjustmentDto[];
  offerGroups: CheckoutQuoteOfferGroupDto[];
}

type CheckoutQuoteCalculationInput =
  | (CheckoutQuoteInput & { deliveryAddress?: CheckoutInput['deliveryAddress'] })
  | (DineInCheckoutQuoteInput & { modality: 'DINE_IN' });

export interface ResolvedDiningTableQuoteContext {
  id: string;
  tenantId: string;
  storeId: string;
  label: string;
  version: number;
  isActive: boolean;
}

function safeAdd(left: number, right: number) {
  try {
    return addCents(left, right);
  } catch (error) {
    if (!(error instanceof MoneyArithmeticError)) throw error;
    throw new CheckoutError(
      'CART_INVALID',
      'O valor do carrinho excede o limite permitido. Revise as quantidades.',
    );
  }
}

function safeMultiply(left: number, right: number) {
  try {
    return multiplyCents(left, right);
  } catch (error) {
    if (!(error instanceof MoneyArithmeticError)) throw error;
    throw new CheckoutError(
      'CART_INVALID',
      'O valor do carrinho excede o limite permitido. Revise as quantidades.',
    );
  }
}

export function assertQuoteFinancialInvariants(quote: {
  subtotal: number;
  automaticDiscount: number;
  couponDiscount: number;
  manualDiscount?: number;
  loyaltyDiscount?: number;
  discount: number;
  deliveryFee: number;
  total: number;
  adjustments: CheckoutQuoteAdjustmentDto[];
  offerGroups: CheckoutQuoteOfferGroupDto[];
}): void {
  try {
    assertCheckoutFinancialInvariants(quote);
  } catch (error) {
    if (!(error instanceof MoneyArithmeticError)) throw error;
    throw new CheckoutError(
      'CART_INVALID',
      'Não foi possível validar os totais do pedido. Atualize o carrinho e tente novamente.',
    );
  }
}

function calculatePercentageDiscount(eligibleBase: number, basisPoints: number): number {
  const value = Math.round((eligibleBase * basisPoints) / 10_000);
  if (!Number.isSafeInteger(value)) {
    throw new CheckoutError('CART_INVALID', 'Não foi possível calcular o desconto informado.');
  }
  return value;
}

/**
 * Etapa autorizada do pricing do PDV. A ordem de stacking é:
 * ofertas automáticas -> cupom -> desconto manual -> frete.
 */
export function applyAuthorizedPosManualDiscount(
  quote: ResolvedCheckoutQuote,
  input: PosManualDiscountInput | undefined,
): ResolvedCheckoutQuote {
  if (!input) return quote;

  const eligibleBase = quote.subtotal - quote.automaticDiscount - quote.couponDiscount;
  if (!Number.isSafeInteger(eligibleBase) || eligibleBase <= 0) {
    throw new CheckoutError(
      'CART_INVALID',
      'Não há valor de mercadorias elegível para desconto manual.',
      422,
    );
  }
  const amount =
    input.mode === 'FIXED' ? input.value : calculatePercentageDiscount(eligibleBase, input.value);
  if (amount <= 0 || amount > eligibleBase) {
    throw new CheckoutError(
      'CART_INVALID',
      'O desconto manual não pode exceder o valor elegível das mercadorias.',
      422,
    );
  }

  const adjustments: CheckoutQuoteAdjustmentDto[] = [
    ...quote.adjustments,
    {
      type: 'MANUAL_DISCOUNT',
      sourceId: null,
      sourceVersion: null,
      label: 'Desconto manual',
      amount,
    },
  ];
  const discount = safeAdd(quote.discount, amount);
  const total = quote.total - amount;
  assertQuoteFinancialInvariants({
    subtotal: quote.subtotal,
    automaticDiscount: quote.automaticDiscount,
    couponDiscount: quote.couponDiscount,
    manualDiscount: amount,
    loyaltyDiscount: quote.loyaltyDiscount,
    discount,
    deliveryFee: quote.deliveryFee,
    total,
    adjustments,
    offerGroups: quote.offerGroups,
  });
  const quoteFingerprint = createHash('sha256')
    .update(
      JSON.stringify({
        baseQuoteFingerprint: quote.quoteFingerprint,
        manualDiscount: input,
        eligibleBase,
        amount,
        discount,
        total,
      }),
    )
    .digest('hex');

  return {
    ...quote,
    quoteFingerprint,
    adjustments,
    manualDiscount: amount,
    loyaltyDiscount: quote.loyaltyDiscount,
    discount,
    total,
  };
}

type EvaluatedLoyaltyReward = {
  reward: AuthorizedLoyaltyReward;
  amount: number;
  eligible: boolean;
  reason: string | null;
  title: string;
};

function loyaltyRewardTitle(reward: AuthorizedLoyaltyReward) {
  if (reward.rewardType === 'FIXED_DISCOUNT') {
    return `R$ ${((reward.value ?? 0) / 100).toFixed(2).replace('.', ',')} de desconto`;
  }
  if (reward.rewardType === 'PERCENT_DISCOUNT') {
    return `${(reward.percentageBasisPoints ?? 0) / 100}% de desconto`;
  }
  return `${reward.freeProductNameSnapshot ?? 'Produto'} grátis`;
}

function evaluateLoyaltyReward(
  quote: ResolvedCheckoutQuote,
  reward: AuthorizedLoyaltyReward,
  now: Date,
): EvaluatedLoyaltyReward {
  const title = loyaltyRewardTitle(reward);
  if (reward.expiresAt && reward.expiresAt <= now) {
    return { reward, amount: 0, eligible: false, reason: 'Este benefício expirou.', title };
  }
  if (quote.couponDiscount > 0 || quote.coupon) {
    return {
      reward,
      amount: 0,
      eligible: false,
      reason: 'Remova o cupom para usar seu benefício de fidelidade.',
      title,
    };
  }
  if (quote.subtotal < reward.minimumOrderValue) {
    return {
      reward,
      amount: 0,
      eligible: false,
      reason: `Disponível em pedidos de itens a partir de R$ ${(reward.minimumOrderValue / 100).toFixed(2).replace('.', ',')}.`,
      title,
    };
  }
  const eligibleSubtotal = Math.max(0, quote.subtotal - quote.automaticDiscount);
  let amount = 0;
  let reason: string | null = null;

  if (reward.rewardType === 'FIXED_DISCOUNT') {
    amount = Math.min(reward.value ?? 0, eligibleSubtotal);
  } else if (reward.rewardType === 'PERCENT_DISCOUNT') {
    const basisPoints = reward.percentageBasisPoints ?? 0;
    const calculated = Math.floor(safeMultiply(eligibleSubtotal, basisPoints) / 10_000);
    amount = Math.min(eligibleSubtotal, reward.maximumDiscountValue ?? calculated, calculated);
  } else {
    const line = quote.lines.find((candidate) => candidate.productId === reward.freeProductId);
    if (!line) {
      reason =
        reward.freeProductState === 'SOLD_OUT'
          ? 'Seu benefício continua disponível, mas este produto acabou por enquanto.'
          : reward.freeProductState === 'ARCHIVED'
            ? 'Seu benefício continua guardado. A loja precisa substituir este produto.'
            : `Adicione ${reward.freeProductNameSnapshot ?? 'o produto'} ao pedido para usar.`;
    } else {
      const optionValue = line.options.reduce((total, option) => safeAdd(total, option.price), 0);
      const currentBaseValue = Math.max(0, line.unitPrice - optionValue);
      const automaticLineDiscount = quote.adjustments
        .filter((adjustment) => adjustment.lineId === line.lineId && adjustment.type !== 'LOYALTY')
        .reduce((total, adjustment) => safeAdd(total, adjustment.amount), 0);
      const remainingBaseValue = Math.max(
        0,
        safeMultiply(currentBaseValue, line.quantity) - automaticLineDiscount,
      );
      const effectiveBaseValue = Math.floor(remainingBaseValue / line.quantity);
      amount = Math.min(
        reward.freeProductBaseValue ?? currentBaseValue,
        currentBaseValue,
        effectiveBaseValue,
        eligibleSubtotal,
      );
    }
  }

  if (amount <= 0 && !reason) reason = 'Não há valor de itens elegível para este benefício.';
  return { reward, amount, eligible: amount > 0 && reason === null, reason, title };
}

export function evaluateAuthorizedLoyaltyRewards(
  quote: ResolvedCheckoutQuote,
  rewards: AuthorizedLoyaltyReward[],
  now = new Date(),
) {
  const evaluated = rewards.map((reward) => evaluateLoyaltyReward(quote, reward, now));
  const recommended = [...evaluated]
    .filter((item) => item.eligible)
    .sort(
      (left, right) =>
        right.amount - left.amount ||
        (left.reward.expiresAt?.getTime() ?? Number.MAX_SAFE_INTEGER) -
          (right.reward.expiresAt?.getTime() ?? Number.MAX_SAFE_INTEGER) ||
        left.reward.createdAt.getTime() - right.reward.createdAt.getTime() ||
        left.reward.id.localeCompare(right.reward.id),
    )[0];
  const options: CheckoutLoyaltyBenefitDto[] = evaluated.map((item) => ({
    id: item.reward.id,
    type: item.reward.rewardType,
    title: item.title,
    savings: item.amount,
    eligible: item.eligible,
    reason: item.reason,
    expiresAt: item.reward.expiresAt?.toISOString() ?? null,
    freeProductId: item.reward.freeProductId,
    recommended: item.reward.id === recommended?.reward.id,
  }));
  return { evaluated, options, recommendedId: recommended?.reward.id ?? null };
}

/** Aplica um benefício já autenticado. Cupom e fidelidade não acumulam. */
export function applyAuthorizedLoyaltyReward(
  quote: ResolvedCheckoutQuote,
  inputReward: AuthorizedLoyaltyReward | LegacyAuthorizedLoyaltyReward,
  now = new Date(),
): ResolvedCheckoutQuote {
  const reward = normalizeAuthorizedLoyaltyReward(inputReward);
  const evaluated = evaluateLoyaltyReward(quote, reward, now);
  if (!evaluated.eligible) {
    throw new CheckoutError(
      quote.couponDiscount > 0 || quote.coupon ? 'COUPON_INVALID' : 'CART_INVALID',
      evaluated.reason ?? 'Este benefício não está disponível para este pedido.',
      422,
    );
  }
  const amount = evaluated.amount;
  const adjustments: CheckoutQuoteAdjustmentDto[] = [
    ...quote.adjustments,
    {
      type: 'LOYALTY',
      sourceId: reward.id,
      sourceVersion: null,
      label:
        reward.rewardType === 'FREE_PRODUCT'
          ? `Benefício de fidelidade: ${reward.freeProductNameSnapshot}`
          : 'Benefício de fidelidade',
      amount,
      lineId:
        reward.rewardType === 'FREE_PRODUCT'
          ? quote.lines.find((line) => line.productId === reward.freeProductId)?.lineId
          : undefined,
    },
  ];
  const discount = safeAdd(quote.discount, amount);
  const total = quote.total - amount;
  assertQuoteFinancialInvariants({
    subtotal: quote.subtotal,
    automaticDiscount: quote.automaticDiscount,
    couponDiscount: quote.couponDiscount,
    manualDiscount: quote.manualDiscount,
    loyaltyDiscount: amount,
    discount,
    deliveryFee: quote.deliveryFee,
    total,
    adjustments,
    offerGroups: quote.offerGroups,
  });
  const quoteFingerprint = createHash('sha256')
    .update(
      JSON.stringify({
        baseQuoteFingerprint: quote.quoteFingerprint,
        loyaltyRewardId: reward.id,
        rewardType: reward.rewardType,
        loyaltyValue: reward.value,
        percentageBasisPoints: reward.percentageBasisPoints,
        maximumDiscountValue: reward.maximumDiscountValue,
        freeProductId: reward.freeProductId,
        minimumOrderValue: reward.minimumOrderValue,
        amount,
        total,
      }),
    )
    .digest('hex');
  return {
    ...quote,
    quoteFingerprint,
    adjustments,
    loyaltyDiscount: amount,
    discount,
    total,
  };
}

export function attachAuthorizedLoyaltyBenefits(
  quote: ResolvedCheckoutQuote,
  rewards: AuthorizedLoyaltyReward[],
  selectedRewardId?: string,
  now = new Date(),
) {
  const result = evaluateAuthorizedLoyaltyRewards(quote, rewards, now);
  const selected = selectedRewardId
    ? rewards.find((reward) => reward.id === selectedRewardId)
    : undefined;
  if (selectedRewardId && !selected) {
    throw new CheckoutError('CART_INVALID', 'Este benefício não está mais disponível.', 409);
  }
  const priced = selected ? applyAuthorizedLoyaltyReward(quote, selected, now) : quote;
  return {
    ...priced,
    loyaltyBenefits: result.options,
    recommendedLoyaltyRewardId: result.recommendedId,
    appliedLoyaltyRewardId: selected?.id ?? null,
  };
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
  modality: CheckoutQuoteCalculationInput['modality'];
  diningTableReference: string | null;
  postalCode: string | null;
  lines: CheckoutQuoteLineDto[];
  offerGroups: CheckoutQuoteOfferGroupDto[];
  adjustments: CheckoutQuoteAdjustmentDto[];
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
          sourceLineId: line.sourceLineId ?? null,
          offerGroupLineId: line.offerGroupLineId ?? null,
          offerComponentPosition: line.offerComponentPosition ?? null,
        })),
        offerGroups: input.offerGroups,
        adjustments: input.adjustments,
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
    diningTable?: ResolvedDiningTableQuoteContext | null;
    channel?: 'STOREFRONT' | 'POS';
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
      timeZone: true,
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
      entitlement: {
        select: { dineInQrEnabled: true, combosPromotionsEnabled: true },
      },
    },
  });
  if (!store) return null;

  const issues: CheckoutQuoteIssueDto[] = [];
  const availability = await getEffectiveStoreAvailabilityForTenant(store.tenantId, store.id, {
    now,
    client,
  });
  const posMayOperateWhilePublicStoreIsClosed =
    options.channel === 'POS' &&
    (availability.state === 'CLOSED_BY_SCHEDULE' || availability.state === 'MANUALLY_CLOSED');
  if (!availability.acceptingOrders && !posMayOperateWhilePublicStoreIsClosed) {
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
  } else if (input.modality === 'DINE_IN') {
    const table = options.diningTable;
    if (!store.entitlement?.dineInQrEnabled) {
      issues.push({
        code: 'STORE_UNAVAILABLE',
        message: 'Os pedidos pelo QR Code estão indisponíveis nesta loja.',
      });
    } else if (
      !table ||
      !table.isActive ||
      table.tenantId !== store.tenantId ||
      table.storeId !== store.id
    ) {
      issues.push({
        code: 'STORE_UNAVAILABLE',
        message: 'Este QR Code não está disponível. Peça ajuda à equipe.',
      });
    }
  }

  const productInputs = input.items.filter((item) => item.kind !== 'COMBO');
  const comboInputs = input.items.filter((item) => item.kind === 'COMBO');
  const comboIds = [...new Set(comboInputs.map((item) => item.comboId))];
  const requestedComboChoiceIds = [
    ...new Set(
      comboInputs.flatMap((item) => item.components.map((component) => component.comboItemId)),
    ),
  ];
  const combos =
    store.entitlement?.combosPromotionsEnabled && comboIds.length > 0
      ? await client.storeCombo.findMany({
          where: {
            id: { in: comboIds },
            tenantId: store.tenantId,
            storeId: store.id,
            archivedAt: null,
          },
          select: {
            id: true,
            name: true,
            specialPrice: true,
            isActive: true,
            version: true,
            startsOn: true,
            endsOnExclusive: true,
            weekdays: true,
            startMinute: true,
            endMinuteExclusive: true,
            items: {
              orderBy: [{ position: 'asc' }, { id: 'asc' }],
              select: { id: true, productId: true, quantity: true, position: true },
            },
          },
        })
      : [];
  const comboMap = new Map(combos.map((combo) => [combo.id, combo]));
  const flexibleCombos =
    store.entitlement?.combosPromotionsEnabled && comboIds.length > 0
      ? await client.storeOffer.findMany({
          where: {
            id: { in: comboIds },
            tenantId: store.tenantId,
            storeId: store.id,
            kind: 'COMBO_FLEXIBLE',
            archivedAt: null,
          },
          select: {
            id: true,
            name: true,
            isActive: true,
            version: true,
            modalities: true,
            startsOn: true,
            endsOnExclusive: true,
            weekdays: true,
            startMinute: true,
            endMinuteExclusive: true,
            combo: {
              select: {
                fixedPrice: true,
                groups: {
                  orderBy: [{ position: 'asc' }, { id: 'asc' }],
                  select: {
                    id: true,
                    quantity: true,
                    position: true,
                    choices: {
                      where: { id: { in: requestedComboChoiceIds } },
                      select: { id: true, productId: true, priceDelta: true },
                    },
                  },
                },
              },
            },
          },
        })
      : [];
  const flexibleComboMap = new Map(flexibleCombos.map((combo) => [combo.id, combo]));
  let expandedUnits = 0;
  for (const item of input.items) {
    if (item.kind !== 'COMBO') {
      expandedUnits = safeAdd(expandedUnits, item.quantity);
      continue;
    }
    const combo = comboMap.get(item.comboId);
    const flexibleCombo = flexibleComboMap.get(item.comboId);
    if (!combo && !flexibleCombo?.combo) continue;
    const unitsPerCombo = combo
      ? combo.items.reduce((total, component) => safeAdd(total, component.quantity), 0)
      : flexibleCombo!.combo!.groups.reduce((total, group) => safeAdd(total, group.quantity), 0);
    expandedUnits = safeAdd(expandedUnits, safeMultiply(unitsPerCombo, item.quantity));
  }
  if (expandedUnits > MAX_CHECKOUT_TOTAL_UNITS) {
    console.warn('[CHECKOUT_EXPANDED_UNIT_LIMIT]', {
      storeId: store.id,
      expandedUnits,
      limit: MAX_CHECKOUT_TOTAL_UNITS,
    });
    issues.push({
      code: 'CART_INVALID',
      message: `O pedido deve ter no máximo ${MAX_CHECKOUT_TOTAL_UNITS} unidades após expandir os combos.`,
    });
  }
  const productIds = [
    ...new Set([
      ...productInputs.map((item) => item.productId),
      ...combos.flatMap((combo) => combo.items.map((item) => item.productId)),
      ...flexibleCombos.flatMap(
        (offer) =>
          offer.combo?.groups.flatMap((group) => group.choices.map((choice) => choice.productId)) ??
          [],
      ),
    ]),
  ];
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
  const canonicalOfferCandidates = store.entitlement?.combosPromotionsEnabled
    ? await client.storeOffer.findMany({
        where: {
          tenantId: store.tenantId,
          storeId: store.id,
          isActive: true,
          archivedAt: null,
          kind: {
            in: [
              'PRODUCT_FIXED_PRICE',
              'QUANTITY_FIXED_PRICE',
              'BOGO',
              'CART_FIXED_DISCOUNT',
              'FREE_DELIVERY',
            ],
          },
          OR: [{ modalities: { isEmpty: true } }, { modalities: { has: input.modality } }],
        },
        select: {
          id: true,
          kind: true,
          name: true,
          version: true,
          startsOn: true,
          endsOnExclusive: true,
          weekdays: true,
          startMinute: true,
          endMinuteExclusive: true,
          maxApplicationsPerOrder: true,
          productPrice: { select: { productId: true, fixedPrice: true } },
          quantityPrice: {
            select: { productId: true, requiredQuantity: true, groupFixedPrice: true },
          },
          bogo: { select: { productId: true, buyQuantity: true, getQuantity: true } },
          cartDiscount: {
            select: { discountType: true, value: true, minSubtotal: true, maxDiscount: true },
          },
          freeDelivery: { select: { minSubtotal: true } },
        },
        orderBy: [{ id: 'asc' }],
      })
    : [];
  const activeCanonicalOffers = canonicalOfferCandidates.filter((offer) =>
    isOfferScheduleActive(offer, store.timeZone, now),
  );
  const promotionCandidates =
    store.entitlement?.combosPromotionsEnabled &&
    activeCanonicalOffers.length === 0 &&
    productInputs.length > 0
      ? await client.storeProductPromotion.findMany({
          where: {
            tenantId: store.tenantId,
            storeId: store.id,
            productId: { in: productInputs.map((item) => item.productId) },
            isActive: true,
            archivedAt: null,
          },
          select: {
            id: true,
            productId: true,
            promotionalPrice: true,
            version: true,
            startsOn: true,
            endsOnExclusive: true,
            weekdays: true,
            startMinute: true,
            endMinuteExclusive: true,
          },
        })
      : [];
  const activePromotionByProduct = new Map<string, (typeof promotionCandidates)[number]>();
  const conflictingPromotionProducts = new Set<string>();
  for (const promotion of promotionCandidates) {
    if (!isOfferScheduleActive(promotion, store.timeZone, now)) continue;
    if (activePromotionByProduct.has(promotion.productId)) {
      conflictingPromotionProducts.add(promotion.productId);
      activePromotionByProduct.delete(promotion.productId);
      continue;
    }
    if (!conflictingPromotionProducts.has(promotion.productId)) {
      activePromotionByProduct.set(promotion.productId, promotion);
    }
  }
  if (conflictingPromotionProducts.size > 0) {
    console.error('[OFFER_CONFLICT_LEGACY_PRODUCT]', {
      storeId: store.id,
      productIds: [...conflictingPromotionProducts].sort(),
    });
    issues.push({
      code: 'CART_INVALID',
      message:
        'Uma promoção do carrinho está com configuração conflitante. Tente novamente em instantes.',
    });
  }
  const canonicalItemOfferByProduct = new Map<string, (typeof activeCanonicalOffers)[number]>();
  const conflictingCanonicalProducts = new Set<string>();
  const cartOffers: (typeof activeCanonicalOffers)[number][] = [];
  const freeDeliveryOffers: (typeof activeCanonicalOffers)[number][] = [];
  for (const offer of activeCanonicalOffers) {
    const productId =
      offer.productPrice?.productId ??
      offer.quantityPrice?.productId ??
      offer.bogo?.productId ??
      null;
    if (productId) {
      if (canonicalItemOfferByProduct.has(productId)) {
        canonicalItemOfferByProduct.delete(productId);
        conflictingCanonicalProducts.add(productId);
      } else if (!conflictingCanonicalProducts.has(productId)) {
        canonicalItemOfferByProduct.set(productId, offer);
      }
    } else if (offer.cartDiscount) {
      cartOffers.push(offer);
    } else if (offer.freeDelivery) {
      freeDeliveryOffers.push(offer);
    }
  }
  if (
    conflictingCanonicalProducts.size > 0 ||
    cartOffers.length > 1 ||
    freeDeliveryOffers.length > 1
  ) {
    console.error('[OFFER_CONFLICT_CANONICAL]', {
      storeId: store.id,
      productIds: [...conflictingCanonicalProducts].sort(),
      cartOfferIds: cartOffers.map((offer) => offer.id),
      freeDeliveryOfferIds: freeDeliveryOffers.map((offer) => offer.id),
    });
    issues.push({
      code: 'CART_INVALID',
      message:
        'As ofertas automáticas estão com configuração conflitante. Tente novamente em instantes.',
    });
  }
  const semanticLines = new Set<string>();
  const lines: CheckoutQuoteLineDto[] = [];
  const offerGroups: CheckoutQuoteOfferGroupDto[] = [];
  const adjustments: CheckoutQuoteAdjustmentDto[] = [];
  let subtotal = 0;
  let automaticDiscount = 0;

  function resolveProductLine(
    product: (typeof products)[number] | undefined,
    item: {
      lineId: string;
      productId: string;
      quantity: number;
      notes: string;
      optionIds: string[];
    },
    offerMetadata: Pick<
      CheckoutQuoteLineDto,
      'sourceLineId' | 'offerGroupLineId' | 'offerComponentPosition'
    > = {},
    reportedLineId = item.lineId,
  ): CheckoutQuoteLineDto | null {
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
        lineId: reportedLineId,
      });
      return null;
    }

    try {
      validateCartItem(product, item);
    } catch (error) {
      issues.push(issueFromError(error, reportedLineId));
      return null;
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
    return {
      lineId: item.lineId,
      ...offerMetadata,
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
    };
  }

  for (const item of input.items) {
    if (item.kind !== 'COMBO') {
      const product = productMap.get(item.productId);
      const semanticFingerprint = JSON.stringify({
        productId: item.productId,
        optionIds: [...item.optionIds].sort(),
        notes: item.notes,
      });
      if (semanticLines.has(semanticFingerprint)) {
        issues.push({
          code: 'CART_INVALID',
          message: `${product?.name ?? 'Este produto'} aparece em linhas repetidas. Una as quantidades para continuar.`,
          lineId: item.lineId,
        });
        continue;
      }
      semanticLines.add(semanticFingerprint);
      const line = resolveProductLine(product, item);
      if (!line) continue;
      lines.push(line);
      subtotal = safeAdd(subtotal, line.itemTotal);

      const promotion = activePromotionByProduct.get(item.productId);
      if (promotion && product && promotion.promotionalPrice < product.basePrice) {
        const amount = safeMultiply(product.basePrice - promotion.promotionalPrice, item.quantity);
        automaticDiscount = safeAdd(automaticDiscount, amount);
        adjustments.push({
          type: 'PRODUCT_PROMOTION',
          sourceId: promotion.id,
          sourceVersion: promotion.version,
          label: `Promoção: ${product.name}`,
          amount,
          lineId: line.lineId,
        });
      }
      const canonicalOffer = canonicalItemOfferByProduct.get(item.productId);
      if (canonicalOffer && product) {
        let amount = 0;
        let applications = 0;
        let type: CheckoutQuoteAdjustmentDto['type'] | null = null;
        if (
          canonicalOffer.productPrice &&
          canonicalOffer.productPrice.fixedPrice < product.basePrice
        ) {
          applications = Math.min(item.quantity, canonicalOffer.maxApplicationsPerOrder);
          amount = safeMultiply(
            product.basePrice - canonicalOffer.productPrice.fixedPrice,
            applications,
          );
          type = 'PRODUCT_PROMOTION';
        } else if (canonicalOffer.quantityPrice) {
          applications = Math.min(
            Math.floor(item.quantity / canonicalOffer.quantityPrice.requiredQuantity),
            canonicalOffer.maxApplicationsPerOrder,
          );
          const regularGroupPrice = safeMultiply(
            product.basePrice,
            canonicalOffer.quantityPrice.requiredQuantity,
          );
          if (canonicalOffer.quantityPrice.groupFixedPrice < regularGroupPrice) {
            amount = safeMultiply(
              regularGroupPrice - canonicalOffer.quantityPrice.groupFixedPrice,
              applications,
            );
            type = 'QUANTITY_PROMOTION';
          }
        } else if (canonicalOffer.bogo) {
          const groupQuantity = safeAdd(
            canonicalOffer.bogo.buyQuantity,
            canonicalOffer.bogo.getQuantity,
          );
          applications = Math.min(
            Math.floor(item.quantity / groupQuantity),
            canonicalOffer.maxApplicationsPerOrder,
          );
          amount = safeMultiply(
            safeMultiply(product.basePrice, canonicalOffer.bogo.getQuantity),
            applications,
          );
          type = 'BOGO';
        }
        if (type && amount > 0 && applications > 0) {
          automaticDiscount = safeAdd(automaticDiscount, amount);
          adjustments.push({
            type,
            sourceId: canonicalOffer.id,
            sourceVersion: canonicalOffer.version,
            label: canonicalOffer.name,
            amount,
            lineId: line.lineId,
          });
        }
      }
      continue;
    }

    const combo = comboMap.get(item.comboId);
    const flexibleCombo = flexibleComboMap.get(item.comboId);
    if (!combo && flexibleCombo?.combo) {
      const modalityAllowed =
        flexibleCombo.modalities.length === 0 || flexibleCombo.modalities.includes(input.modality);
      if (
        !flexibleCombo.isActive ||
        !modalityAllowed ||
        !isOfferScheduleActive(flexibleCombo, store.timeZone, now)
      ) {
        issues.push({
          code: 'OFFER_UNAVAILABLE',
          message: `${flexibleCombo.name} não está disponível para este pedido.`,
          lineId: item.lineId,
        });
        continue;
      }

      const requestedComponents = new Map(
        item.components.map((component) => [component.comboItemId, component]),
      );
      const validSelection =
        flexibleCombo.combo.groups.length >= 2 &&
        requestedComponents.size === flexibleCombo.combo.groups.length &&
        flexibleCombo.combo.groups.every(
          (group) => group.choices.length === 1 && requestedComponents.has(group.choices[0]!.id),
        );
      if (!validSelection) {
        console.warn('[FLEXIBLE_COMBO_INVALID_SELECTION]', {
          storeId: store.id,
          offerId: flexibleCombo.id,
          requestedChoiceCount: requestedComponents.size,
        });
        issues.push({
          code: 'OFFER_UNAVAILABLE',
          message: `${flexibleCombo.name} mudou. Faça novamente as escolhas do combo.`,
          lineId: item.lineId,
        });
        continue;
      }

      const groupLines: CheckoutQuoteLineDto[] = [];
      let regularBaseAmount = 0;
      let priceDeltaPerCombo = 0;
      for (const group of flexibleCombo.combo.groups) {
        const choice = group.choices[0]!;
        const requested = requestedComponents.get(choice.id)!;
        const quantity = safeMultiply(group.quantity, item.quantity);
        const product = productMap.get(choice.productId);
        const componentLineId = `${item.lineId}:${choice.id}`;
        const line = resolveProductLine(
          product,
          {
            lineId: componentLineId,
            productId: choice.productId,
            quantity,
            notes: requested.notes,
            optionIds: requested.optionIds,
          },
          {
            sourceLineId: item.lineId,
            offerGroupLineId: item.lineId,
            offerComponentPosition: group.position,
          },
          item.lineId,
        );
        if (!line || !product) continue;
        groupLines.push(line);
        regularBaseAmount = safeAdd(regularBaseAmount, safeMultiply(product.basePrice, quantity));
        priceDeltaPerCombo = safeAdd(
          priceDeltaPerCombo,
          safeMultiply(choice.priceDelta, group.quantity),
        );
      }
      if (groupLines.length !== flexibleCombo.combo.groups.length) continue;

      const offerUnitBaseAmount = safeAdd(flexibleCombo.combo.fixedPrice, priceDeltaPerCombo);
      const offerBaseAmount = safeMultiply(offerUnitBaseAmount, item.quantity);
      if (regularBaseAmount <= offerBaseAmount) {
        issues.push({
          code: 'OFFER_UNAVAILABLE',
          message: `${flexibleCombo.name} está sendo atualizado e perdeu a economia.`,
          lineId: item.lineId,
        });
        continue;
      }
      const discountAmount = regularBaseAmount - offerBaseAmount;
      const group: CheckoutQuoteOfferGroupDto = {
        lineId: item.lineId,
        comboId: flexibleCombo.id,
        comboVersion: flexibleCombo.version,
        name: flexibleCombo.name,
        quantity: item.quantity,
        regularBaseAmount,
        offerBaseAmount,
        discountAmount,
        components: flexibleCombo.combo.groups.map((comboGroup) => ({
          lineId: `${item.lineId}:${comboGroup.choices[0]!.id}`,
          comboItemId: comboGroup.choices[0]!.id,
          position: comboGroup.position,
        })),
      };
      lines.push(...groupLines);
      offerGroups.push(group);
      for (const line of groupLines) subtotal = safeAdd(subtotal, line.itemTotal);
      automaticDiscount = safeAdd(automaticDiscount, discountAmount);
      adjustments.push({
        type: 'COMBO',
        sourceId: flexibleCombo.id,
        sourceVersion: flexibleCombo.version,
        label: `Combo: ${flexibleCombo.name}`,
        amount: discountAmount,
        offerGroupLineId: item.lineId,
      });
      continue;
    }
    if (
      !store.entitlement?.combosPromotionsEnabled ||
      !combo ||
      !combo.isActive ||
      !isOfferScheduleActive(combo, store.timeZone, now)
    ) {
      issues.push({
        code: 'OFFER_UNAVAILABLE',
        message: combo
          ? `${combo.name} não está disponível no momento.`
          : 'Um combo do carrinho não está mais disponível.',
        lineId: item.lineId,
      });
      continue;
    }

    const requestedComponents = new Map(
      item.components.map((component) => [component.comboItemId, component]),
    );
    if (
      requestedComponents.size !== combo.items.length ||
      combo.items.some((component) => !requestedComponents.has(component.id))
    ) {
      issues.push({
        code: 'OFFER_UNAVAILABLE',
        message: `${combo.name} mudou. Revise as opções do combo para continuar.`,
        lineId: item.lineId,
      });
      continue;
    }

    const groupLines: CheckoutQuoteLineDto[] = [];
    let regularBaseAmount = 0;
    for (const component of combo.items) {
      const requested = requestedComponents.get(component.id)!;
      const quantity = safeMultiply(component.quantity, item.quantity);
      const product = productMap.get(component.productId);
      const componentLineId = `${item.lineId}:${component.id}`;
      const line = resolveProductLine(
        product,
        {
          lineId: componentLineId,
          productId: component.productId,
          quantity,
          notes: requested.notes,
          optionIds: requested.optionIds,
        },
        {
          sourceLineId: item.lineId,
          offerGroupLineId: item.lineId,
          offerComponentPosition: component.position,
        },
        item.lineId,
      );
      if (!line || !product) continue;
      groupLines.push(line);
      regularBaseAmount = safeAdd(regularBaseAmount, safeMultiply(product.basePrice, quantity));
    }
    if (groupLines.length !== combo.items.length) continue;

    const offerBaseAmount = safeMultiply(combo.specialPrice, item.quantity);
    if (regularBaseAmount <= offerBaseAmount) {
      issues.push({
        code: 'OFFER_UNAVAILABLE',
        message: `${combo.name} está sendo atualizado e perdeu a economia.`,
        lineId: item.lineId,
      });
      continue;
    }
    const discountAmount = regularBaseAmount - offerBaseAmount;
    const group: CheckoutQuoteOfferGroupDto = {
      lineId: item.lineId,
      comboId: combo.id,
      comboVersion: combo.version,
      name: combo.name,
      quantity: item.quantity,
      regularBaseAmount,
      offerBaseAmount,
      discountAmount,
      components: combo.items.map((component) => ({
        lineId: `${item.lineId}:${component.id}`,
        comboItemId: component.id,
        position: component.position,
      })),
    };
    lines.push(...groupLines);
    offerGroups.push(group);
    for (const line of groupLines) subtotal = safeAdd(subtotal, line.itemTotal);
    automaticDiscount = safeAdd(automaticDiscount, discountAmount);
    adjustments.push({
      type: 'COMBO',
      sourceId: combo.id,
      sourceVersion: combo.version,
      label: `Combo: ${combo.name}`,
      amount: discountAmount,
      offerGroupLineId: item.lineId,
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
  const standardInput = input.modality === 'DINE_IN' ? null : input;
  const manualAddressPostalCode = standardInput?.deliveryAddress?.postalCode ?? null;
  const effectivePostalCode =
    savedAddressPostalCode ?? manualAddressPostalCode ?? standardInput?.deliveryPostalCode ?? null;
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

  const itemNetBeforeCart = subtotal - automaticDiscount;
  const cartOffer = cartOffers.length === 1 ? cartOffers[0] : null;
  if (cartOffer?.cartDiscount && itemNetBeforeCart >= cartOffer.cartDiscount.minSubtotal) {
    const calculated =
      cartOffer.cartDiscount.discountType === 'PERCENTAGE'
        ? Math.floor(safeMultiply(itemNetBeforeCart, cartOffer.cartDiscount.value) / 100)
        : cartOffer.cartDiscount.value;
    const cartDiscount = Math.min(
      itemNetBeforeCart,
      cartOffer.cartDiscount.maxDiscount ?? calculated,
      calculated,
    );
    if (cartDiscount > 0) {
      automaticDiscount = safeAdd(automaticDiscount, cartDiscount);
      adjustments.push({
        type: 'CART_DISCOUNT',
        sourceId: cartOffer.id,
        sourceVersion: cartOffer.version,
        label: cartOffer.name,
        amount: cartDiscount,
      });
    }
  }
  const merchandiseBeforeCoupon = subtotal - automaticDiscount;
  const freeDeliveryOffer = freeDeliveryOffers.length === 1 ? freeDeliveryOffers[0] : null;
  if (
    freeDeliveryOffer?.freeDelivery &&
    deliveryFee > 0 &&
    merchandiseBeforeCoupon >= freeDeliveryOffer.freeDelivery.minSubtotal
  ) {
    automaticDiscount = safeAdd(automaticDiscount, deliveryFee);
    adjustments.push({
      type: 'FREE_DELIVERY',
      sourceId: freeDeliveryOffer.id,
      sourceVersion: freeDeliveryOffer.version,
      label: freeDeliveryOffer.name,
      amount: deliveryFee,
    });
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
  let couponDiscount = 0;
  const couponEligibleBase = merchandiseBeforeCoupon;
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
      (candidate.minOrderValue != null && couponEligibleBase < candidate.minOrderValue);
    if (invalid || !candidate) {
      issues.push({
        code: 'COUPON_INVALID',
        message: 'Este cupom não está disponível para este pedido.',
      });
    } else {
      const calculated =
        candidate.type === 'PERCENTAGE'
          ? Math.floor((couponEligibleBase * candidate.value) / 100)
          : candidate.value;
      couponDiscount = Math.min(
        couponEligibleBase,
        candidate.maxDiscount ?? calculated,
        calculated,
      );
      couponId = candidate.id;
      coupon = { code: candidate.code, discount: couponDiscount };
      if (couponDiscount > 0) {
        adjustments.push({
          type: 'COUPON',
          sourceId: candidate.id,
          sourceVersion: null,
          label: `Cupom ${candidate.code}`,
          amount: couponDiscount,
        });
      }
    }
  }

  const discount = safeAdd(automaticDiscount, couponDiscount);
  const total = safeAdd(subtotal - discount, deliveryFee);
  assertQuoteFinancialInvariants({
    subtotal,
    automaticDiscount,
    couponDiscount,
    manualDiscount: 0,
    loyaltyDiscount: 0,
    discount,
    deliveryFee,
    total,
    adjustments,
    offerGroups,
  });
  const fingerprint = quoteFingerprint({
    storeId: store.id,
    modality: input.modality,
    diningTableReference:
      input.modality === 'DINE_IN' && options.diningTable
        ? `${options.diningTable.id}:${options.diningTable.version}`
        : null,
    postalCode: effectivePostalCode,
    lines,
    offerGroups,
    adjustments,
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
    offerGroups,
    adjustments,
    subtotal,
    automaticDiscount,
    couponDiscount,
    manualDiscount: 0,
    loyaltyDiscount: 0,
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

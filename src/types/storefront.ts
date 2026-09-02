/**
 * Contratos serializáveis e intencionalmente públicos do storefront.
 *
 * Estes DTOs não devem importar tipos Prisma nem receber campos administrativos,
 * de tenant ou dados pessoais.
 */
export interface PublicStorefrontOptionDto {
  id: string;
  name: string;
  price: number;
}

export type PublicCheckoutPaymentMethod =
  | {
      method: 'PIX';
      processing: 'ONLINE';
      provider: 'MERCADO_PAGO';
      requiresEmail: true;
      environment: 'SANDBOX' | 'PRODUCTION';
    }
  | {
      method: 'PIX' | 'CASH' | 'CARD_ON_DELIVERY' | 'CARD_IN_PERSON';
      processing: 'MANUAL';
    };

export interface PublicCheckoutPaymentConfig {
  methods: PublicCheckoutPaymentMethod[];
}

/**
 * Snapshot ordenado da opção usado pela cotação e persistido no pedido.
 * Os campos do grupo evitam consultar o catálogo mutável ao exibir o histórico.
 */
export interface CheckoutQuoteOptionDto extends PublicStorefrontOptionDto {
  position: number;
  groupId: string;
  groupName: string;
  groupPosition: number;
}

export interface PublicStorefrontOptionGroupDto {
  id: string;
  title: string;
  description: string | null;
  isRequired: boolean;
  isMultiple: boolean;
  minSelections: number;
  maxSelections: number;
  options: PublicStorefrontOptionDto[];
}

export interface PublicStorefrontProductSummaryDto {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  imageAssetId: string | null;
  basePrice: number;
  isFeatured: boolean;
  isSoldOut: boolean;
}

export interface PublicStorefrontProductDetailDto extends PublicStorefrontProductSummaryDto {
  allowNotes: boolean;
  optionGroups: PublicStorefrontOptionGroupDto[];
}

export interface PublicStorefrontProductDetailResponseDto {
  product: PublicStorefrontProductDetailDto;
}

export interface PublicRepeatOrderReadyItemDto {
  productId: string;
  productName: string;
  basePrice: number;
  unitPrice: number;
  quantity: number;
  notes: string;
  imageUrl: string | null;
  imageAssetId: string | null;
  selectedOptions: PublicStorefrontOptionDto[];
  priceChanged: boolean;
}

export interface PublicRepeatOrderIssueDto {
  productId: string;
  productName: string;
  reason: 'UNAVAILABLE' | 'REVIEW_REQUIRED';
  message: string;
}

export interface PublicRepeatOrderResponseDto {
  readyItems: PublicRepeatOrderReadyItemDto[];
  issues: PublicRepeatOrderIssueDto[];
}

/**
 * Recorte público e compacto usado somente para sugestões no carrinho.
 * A ordem do array representa a prioridade comercial calculada no servidor.
 */
export interface PublicCartRecommendationDto {
  id: string;
  name: string;
  basePrice: number;
  imageUrl: string | null;
  imageAssetId: string | null;
  category: {
    id: string;
    name: string;
  };
  isAvailable: boolean;
  isFeatured: boolean;
  requiresConfiguration: boolean;
}

export interface PublicCartRecommendationsResponseDto {
  recommendations: PublicCartRecommendationDto[];
}

export interface PublicStorefrontCategoryImageDto {
  id: string;
  url: string;
  altText: string;
  width: number;
  height: number;
}

export interface PublicStorefrontCategoryDto {
  id: string;
  name: string;
  description: string | null;
  image: PublicStorefrontCategoryImageDto | null;
  products: PublicStorefrontProductSummaryDto[];
}

export interface PublicStorefrontComboComponentDto {
  comboItemId: string;
  quantity: number;
  product: PublicStorefrontProductDetailDto;
}

export interface PublicStorefrontFlexibleComboChoiceDto {
  choiceId: string;
  priceDelta: number;
  product: PublicStorefrontProductDetailDto;
}

export interface PublicStorefrontFlexibleComboGroupDto {
  groupId: string;
  name: string;
  quantity: number;
  choices: PublicStorefrontFlexibleComboChoiceDto[];
}

export type PublicStorefrontOfferDto =
  | {
      kind: 'COMBO';
      id: string;
      version: number;
      name: string;
      description: string | null;
      regularPrice: number;
      offerPrice: number;
      savings: number;
      imageUrl: string | null;
      imageAssetId: string | null;
      components: PublicStorefrontComboComponentDto[];
    }
  | {
      kind: 'PRODUCT_PROMOTION';
      id: string;
      version: number;
      regularPrice: number;
      offerPrice: number;
      savings: number;
      product: PublicStorefrontProductSummaryDto;
    }
  | {
      kind: 'FLEXIBLE_COMBO';
      id: string;
      version: number;
      name: string;
      description: string | null;
      regularPrice: number;
      offerPrice: number;
      savings: number;
      imageUrl: string | null;
      imageAssetId: string | null;
      groups: PublicStorefrontFlexibleComboGroupDto[];
    };

export interface PublicStorefrontBannerDto {
  id: string;
  title: string;
  subtitle: string | null;
  buttonText: string | null;
  href: string | null;
  priority: number;
  imageAssetId: string | null;
  imageUrl: string | null;
  imageAlt: string;
}

export interface PublicDeliveryZoneDto {
  id: string;
  name: string;
  fee: number;
  estimatedTime: string | null;
  minOrderValue: number | null;
}

export type CheckoutQuoteIssueCode =
  | 'STORE_UNAVAILABLE'
  | 'PRODUCT_UNAVAILABLE'
  | 'OFFER_UNAVAILABLE'
  | 'CART_INVALID'
  | 'OUTSIDE_DELIVERY_AREA'
  | 'DELIVERY_ZONE_REQUIRED'
  | 'SAVED_ADDRESS_UNAVAILABLE'
  | 'COUPON_INVALID'
  | 'MIN_ORDER_NOT_REACHED';

export interface CheckoutQuoteIssueDto {
  code: CheckoutQuoteIssueCode;
  message: string;
  lineId?: string;
}

export interface CheckoutQuoteLineDto {
  lineId: string;
  sourceLineId?: string;
  productId: string;
  productName: string;
  imageUrl: string | null;
  imageAssetId: string | null;
  quantity: number;
  notes: string;
  options: CheckoutQuoteOptionDto[];
  unitPrice: number;
  itemTotal: number;
  offerGroupLineId?: string;
  offerComponentPosition?: number;
}

export interface CheckoutQuoteOfferGroupDto {
  lineId: string;
  comboId: string;
  comboVersion: number;
  name: string;
  quantity: number;
  regularBaseAmount: number;
  offerBaseAmount: number;
  discountAmount: number;
  components: Array<{
    lineId: string;
    comboItemId: string;
    position: number;
  }>;
}

export type CheckoutQuoteAdjustmentType =
  | 'COMBO'
  | 'PRODUCT_PROMOTION'
  | 'QUANTITY_PROMOTION'
  | 'BOGO'
  | 'CART_DISCOUNT'
  | 'FREE_DELIVERY'
  | 'COUPON'
  | 'MANUAL_DISCOUNT'
  | 'LOYALTY';

export interface CheckoutQuoteAdjustmentDto {
  type: CheckoutQuoteAdjustmentType;
  sourceId: string | null;
  sourceVersion: number | null;
  label: string;
  amount: number;
  lineId?: string;
  offerGroupLineId?: string;
}

export interface CheckoutQuoteCouponDto {
  code: string;
  discount: number;
}

export type LoyaltyBenefitTypeDto = 'FIXED_DISCOUNT' | 'PERCENT_DISCOUNT' | 'FREE_PRODUCT';

export interface CheckoutLoyaltyBenefitDto {
  id: string;
  type: LoyaltyBenefitTypeDto;
  title: string;
  savings: number;
  eligible: boolean;
  reason: string | null;
  expiresAt: string | null;
  freeProductId: string | null;
  recommended: boolean;
}

export interface CheckoutQuoteDto {
  quoteFingerprint: string;
  storeId: string;
  storeSlug: string;
  lines: CheckoutQuoteLineDto[];
  offerGroups?: CheckoutQuoteOfferGroupDto[];
  adjustments?: CheckoutQuoteAdjustmentDto[];
  subtotal: number;
  automaticDiscount?: number;
  couponDiscount?: number;
  manualDiscount?: number;
  loyaltyDiscount?: number;
  loyaltyBenefits?: CheckoutLoyaltyBenefitDto[];
  recommendedLoyaltyRewardId?: string | null;
  appliedLoyaltyRewardId?: string | null;
  discount: number;
  deliveryFee: number;
  total: number;
  minOrderValue: number;
  missingForMinimum: number;
  deliveryZoneId: string | null;
  deliveryZoneName: string | null;
  estimatedMinMinutes?: number;
  estimatedMaxMinutes?: number;
  promisedFulfillmentMinAt: string;
  promisedFulfillmentMaxAt: string;
  coupon: CheckoutQuoteCouponDto | null;
  issues: CheckoutQuoteIssueDto[];
  canCheckout: boolean;
}

export interface PublicRecentOrderItemDto {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  notes: string;
  imageUrl: string | null;
  imageAssetId: string | null;
  options: Array<{
    id?: string;
    name: string;
    price: number;
  }>;
}

export interface PublicRecentOrderDto {
  id: string;
  orderNumber: number;
  lastPurchasedAt: string;
  timeAgoLabel: string;
  totalItemCount: number;
  totalCents: number;
  itemsSummary: string;
  extraItemsCount: number;
  thumbnails: Array<{
    imageUrl: string | null;
    imageAssetId: string | null;
    productName: string;
  }>;
  extraThumbnailsCount: number;
  items: PublicRecentOrderItemDto[];
}

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
  productId: string;
  productName: string;
  imageUrl: string | null;
  imageAssetId: string | null;
  quantity: number;
  notes: string;
  options: PublicStorefrontOptionDto[];
  unitPrice: number;
  itemTotal: number;
}

export interface CheckoutQuoteCouponDto {
  code: string;
  discount: number;
}

export interface CheckoutQuoteDto {
  quoteFingerprint: string;
  storeId: string;
  storeSlug: string;
  lines: CheckoutQuoteLineDto[];
  subtotal: number;
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

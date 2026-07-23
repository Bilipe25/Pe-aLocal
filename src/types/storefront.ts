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

export interface PublicStorefrontProductDto {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  imageAssetId: string | null;
  basePrice: number;
  isFeatured: boolean;
  isSoldOut: boolean;
  allowNotes: boolean;
  optionGroups: PublicStorefrontOptionGroupDto[];
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
  products: PublicStorefrontProductDto[];
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

import type { StoreCustomizationConfig } from '@/schemas/customization';
import type { PublicStorefrontCategoryDto } from '@/types/storefront';

interface StorefrontJsonLdAsset {
  url: string;
}

interface StorefrontJsonLdStore {
  name: string;
  description: string | null;
  phone: string | null;
  logoUrl: string | null;
  coverUrl: string | null;
  address: {
    street?: string;
    number?: string;
    complement?: string | null;
    neighborhood?: string;
    city: string;
    state: string;
    zipCode?: string;
  } | null;
  openingHours: Array<{
    dayOfWeek: string;
    openTime: string;
    closeTime: string;
  }>;
  customization: {
    config: StoreCustomizationConfig;
    assets: {
      logo?: StorefrontJsonLdAsset | null;
      cover?: StorefrontJsonLdAsset | null;
      socialImage?: StorefrontJsonLdAsset | null;
    };
  };
}

const schemaDayByStoreDay: Record<string, string> = {
  MONDAY: 'Monday',
  TUESDAY: 'Tuesday',
  WEDNESDAY: 'Wednesday',
  THURSDAY: 'Thursday',
  FRIDAY: 'Friday',
  SATURDAY: 'Saturday',
  SUNDAY: 'Sunday',
};

function absoluteUrl(value: string | null | undefined, baseUrl: string) {
  if (!value) return null;
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return null;
  }
}

function buildAddress(store: StorefrontJsonLdStore) {
  if (!store.address) return null;

  return {
    '@type': 'PostalAddress',
    ...(store.address.street
      ? {
          streetAddress: [
            `${store.address.street}, ${store.address.number ?? ''}`.trim(),
            store.address.complement?.trim(),
          ]
            .filter(Boolean)
            .join(', '),
        }
      : {}),
    addressLocality: [store.address.neighborhood, store.address.city].filter(Boolean).join(', '),
    addressRegion: store.address.state,
    ...(store.address.zipCode ? { postalCode: store.address.zipCode } : {}),
    addressCountry: 'BR',
  };
}

function buildOpeningHours(store: StorefrontJsonLdStore) {
  return store.openingHours.flatMap((hour) => {
    const dayOfWeek = schemaDayByStoreDay[hour.dayOfWeek];
    return dayOfWeek
      ? [
          {
            '@type': 'OpeningHoursSpecification',
            dayOfWeek: `https://schema.org/${dayOfWeek}`,
            opens: hour.openTime,
            closes: hour.closeTime,
          },
        ]
      : [];
  });
}

export function buildMenuJsonLd(
  store: StorefrontJsonLdStore,
  categories: PublicStorefrontCategoryDto[],
  url: string,
) {
  const baseUrl = url.replace(/\/+$/, '');
  const menuId = `${baseUrl}#menu`;
  const restaurantId = `${baseUrl}#restaurant`;
  const sections = categories.map((category) => ({
    '@type': 'MenuSection',
    '@id': `${baseUrl}#category-${category.id}`,
    name: category.name,
    ...(category.description ? { description: category.description } : {}),
    hasMenuItem: category.products.map((product) => ({
      '@id': `${baseUrl}#product-${product.id}`,
    })),
  }));
  const menuItems = categories.flatMap((category) =>
    category.products.map((product) => ({
      '@type': 'MenuItem',
      '@id': `${baseUrl}#product-${product.id}`,
      name: product.name,
      ...(product.description ? { description: product.description } : {}),
      ...(absoluteUrl(product.imageUrl, baseUrl)
        ? { image: absoluteUrl(product.imageUrl, baseUrl) }
        : {}),
      url: `${baseUrl}#product-${product.id}`,
      offers: {
        '@type': 'Offer',
        price: (product.basePrice / 100).toFixed(2),
        priceCurrency: 'BRL',
        availability: `https://schema.org/${product.isSoldOut ? 'OutOfStock' : 'InStock'}`,
        url: `${baseUrl}#product-${product.id}`,
        seller: { '@id': restaurantId },
      },
    })),
  );
  const images = [
    store.customization.assets.socialImage?.url,
    store.customization.assets.cover?.url,
    store.coverUrl,
    store.customization.assets.logo?.url,
    store.logoUrl,
  ]
    .map((value) => absoluteUrl(value, baseUrl))
    .filter((value): value is string => Boolean(value));
  const address = buildAddress(store);
  const openingHours = buildOpeningHours(store);

  const restaurant = {
    '@type': 'Restaurant',
    '@id': restaurantId,
    name: store.name,
    url: baseUrl,
    ...(store.description ? { description: store.description } : {}),
    ...(store.phone ? { telephone: store.phone } : {}),
    ...(images.length > 0 ? { image: [...new Set(images)] } : {}),
    ...(address ? { address } : {}),
    ...(openingHours.length > 0 ? { openingHoursSpecification: openingHours } : {}),
    hasMenu: { '@id': menuId },
  };
  const menu = {
    '@type': 'Menu',
    '@id': menuId,
    name: `Cardápio de ${store.name}`,
    url: baseUrl,
    inLanguage: 'pt-BR',
    hasMenuSection: sections.map((section) => ({ '@id': section['@id'] })),
  };

  return {
    '@context': 'https://schema.org',
    '@graph': [restaurant, menu, ...sections, ...menuItems],
  };
}

export function serializeJsonLd(value: unknown) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

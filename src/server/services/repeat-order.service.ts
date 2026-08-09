import 'server-only';

import { storeAssetUrl } from '@/features/assets/urls';
import { getDb } from '@/server/database/client';
import {
  hashStorefrontDeviceToken,
  isStorefrontDeviceToken,
} from '@/server/services/customer-device-recognition.service';
import type {
  PublicRepeatOrderIssueDto,
  PublicRepeatOrderReadyItemDto,
  PublicRepeatOrderResponseDto,
} from '@/types/storefront';

interface RepeatOrderScope {
  tenantId: string;
  storeId: string;
  orderId?: string;
  trackingToken?: string;
  deviceToken?: string | null;
  now?: Date;
}

function issue(
  productId: string,
  productName: string,
  reason: PublicRepeatOrderIssueDto['reason'],
  message: string,
): PublicRepeatOrderIssueDto {
  return { productId, productName, reason, message };
}

export async function prepareOrderRepeat({
  tenantId,
  storeId,
  orderId,
  trackingToken,
  deviceToken,
  now = new Date(),
}: RepeatOrderScope): Promise<PublicRepeatOrderResponseDto | null> {
  if (Boolean(orderId) === Boolean(trackingToken)) return null;

  let recognizedCustomerId: string | null = null;
  if (orderId) {
    if (!isStorefrontDeviceToken(deviceToken)) return null;
    const tokenHash = await hashStorefrontDeviceToken(deviceToken);
    const device = await getDb().storefrontDevice.findUnique({
      where: { tokenHash },
      select: {
        expiresAt: true,
        recognitions: {
          where: {
            tenantId,
            storeId,
            revokedAt: null,
            expiresAt: { gt: now },
            customer: { tenantId, recognitionEnabled: true },
          },
          take: 1,
          select: { customerId: true },
        },
      },
    });
    if (!device || device.expiresAt <= now) return null;
    recognizedCustomerId = device.recognitions[0]?.customerId ?? null;
    if (!recognizedCustomerId) return null;
  }

  const order = await getDb().order.findFirst({
    where: {
      tenantId,
      storeId,
      ...(orderId
        ? { id: orderId, customerId: recognizedCustomerId }
        : { publicToken: trackingToken, publicTokenExpiresAt: { gt: now } }),
    },
    select: {
      items: {
        orderBy: [{ position: 'asc' }, { id: 'asc' }],
        select: {
          productId: true,
          productName: true,
          unitPrice: true,
          quantity: true,
          notes: true,
          options: {
            orderBy: [{ groupPosition: 'asc' }, { position: 'asc' }, { id: 'asc' }],
            select: { optionId: true },
          },
        },
      },
    },
  });
  if (!order) return null;

  const productIds = [...new Set(order.items.map((item) => item.productId))];
  const products = await getDb().product.findMany({
    where: {
      tenantId,
      storeId,
      id: { in: productIds },
      archivedAt: null,
      isAvailable: true,
      isSoldOut: false,
      category: { tenantId, storeId, archivedAt: null, isActive: true },
    },
    select: {
      id: true,
      name: true,
      basePrice: true,
      allowNotes: true,
      imageUrl: true,
      imageAssetId: true,
      optionGroups: {
        where: { archivedAt: null, isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          title: true,
          isRequired: true,
          minSelections: true,
          maxSelections: true,
          options: {
            where: { archivedAt: null, isAvailable: true },
            orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
            select: { id: true, name: true, price: true },
          },
        },
      },
    },
  });
  const productMap = new Map(products.map((product) => [product.id, product]));
  const readyItems: PublicRepeatOrderReadyItemDto[] = [];
  const issues: PublicRepeatOrderIssueDto[] = [];

  for (const historicItem of order.items) {
    const product = productMap.get(historicItem.productId);
    if (!product) {
      issues.push(
        issue(
          historicItem.productId,
          historicItem.productName,
          'UNAVAILABLE',
          `${historicItem.productName} não está mais disponível.`,
        ),
      );
      continue;
    }

    const selectedIds = new Set(historicItem.options.map((option) => option.optionId));
    const currentOptions = product.optionGroups.flatMap((group) =>
      group.options.map((option) => ({ ...option, groupId: group.id })),
    );
    const optionMap = new Map(currentOptions.map((option) => [option.id, option]));
    const hasRemovedOption = [...selectedIds].some((optionId) => !optionMap.has(optionId));
    const hasInvalidGroup = product.optionGroups.some((group) => {
      const selectedCount = group.options.filter((option) => selectedIds.has(option.id)).length;
      const minimum = group.isRequired ? Math.max(1, group.minSelections) : group.minSelections;
      return selectedCount < minimum || selectedCount > group.maxSelections;
    });
    const notesNeedReview = Boolean(historicItem.notes && !product.allowNotes);

    if (hasRemovedOption || hasInvalidGroup || notesNeedReview) {
      issues.push(
        issue(
          product.id,
          product.name,
          'REVIEW_REQUIRED',
          `${product.name} precisa ter as opções revisadas antes de ser adicionado.`,
        ),
      );
      continue;
    }

    const selectedOptions = [...selectedIds]
      .map((optionId) => optionMap.get(optionId))
      .filter((option): option is NonNullable<typeof option> => Boolean(option))
      .map((option) => ({ id: option.id, name: option.name, price: option.price }));
    const unitPrice = selectedOptions.reduce(
      (sum, option) => sum + option.price,
      product.basePrice,
    );
    readyItems.push({
      productId: product.id,
      productName: product.name,
      basePrice: product.basePrice,
      unitPrice,
      quantity: Math.min(99, historicItem.quantity),
      notes: product.allowNotes ? (historicItem.notes ?? '') : '',
      imageUrl: product.imageAssetId ? storeAssetUrl(product.imageAssetId, 384) : product.imageUrl,
      imageAssetId: product.imageAssetId,
      selectedOptions,
      priceChanged: unitPrice !== historicItem.unitPrice,
    });
  }

  return { readyItems, issues };
}

'use client';

import { useCartStore } from '@/stores/cart-store';
import type { PublicRepeatOrderResponseDto } from '@/types/storefront';

export interface RepeatOrderReference {
  orderId?: string;
  trackingToken?: string;
}

export interface RepeatOrderResult {
  addedQuantity: number;
  issueCount: number;
  priceChanged: boolean;
}

function isRepeatOrderResponse(value: unknown): value is PublicRepeatOrderResponseDto {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return Array.isArray(candidate.readyItems) && Array.isArray(candidate.issues);
}

export async function repeatOrderIntoCart(input: {
  storeId: string;
  storeSlug: string;
  reference: RepeatOrderReference;
}): Promise<RepeatOrderResult> {
  const response = await fetch(
    `/api/storefront/${encodeURIComponent(input.storeSlug)}/repeat-order`,
    {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(input.reference),
    },
  );
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok || !isRepeatOrderResponse(payload)) {
    throw new Error('Não foi possível revisar este pedido agora.');
  }

  const cart = useCartStore.getState();
  cart.setStore(input.storeId, input.storeSlug);
  let addedQuantity = 0;
  for (const item of payload.readyItems) {
    useCartStore.getState().addItem({
      productId: item.productId,
      productName: item.productName,
      basePrice: item.basePrice,
      unitPrice: item.unitPrice,
      quantity: item.quantity,
      notes: item.notes,
      selectedOptions: item.selectedOptions,
      imageUrl: item.imageUrl,
      imageAssetId: item.imageAssetId,
      imageAlt: item.productName,
    });
    addedQuantity += item.quantity;
  }

  return {
    addedQuantity,
    issueCount: payload.issues.length,
    priceChanged: payload.readyItems.some((item) => item.priceChanged),
  };
}

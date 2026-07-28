'use client';

import { useEffect, useState } from 'react';

import { ProductModal } from '@/components/storefront/product-modal';
import type { CartItem } from '@/stores/cart-store';
import type {
  PublicStorefrontProductDetailDto,
  PublicStorefrontProductDetailResponseDto,
  PublicStorefrontProductSummaryDto,
} from '@/types/storefront';

interface CartItemEditorProps {
  storeSlug: string;
  item: CartItem;
  storeOpen: boolean;
  onClose: () => void;
}

type DetailState =
  | { status: 'loading'; detail: null; error?: undefined }
  | { status: 'success'; detail: PublicStorefrontProductDetailDto; error?: undefined }
  | { status: 'error'; detail: null; error: string };

function isProductDetailResponse(
  payload: unknown,
  productId: string,
): payload is PublicStorefrontProductDetailResponseDto {
  if (!payload || typeof payload !== 'object' || !('product' in payload)) return false;
  const product = payload.product;
  return (
    product !== null &&
    product !== undefined &&
    typeof product === 'object' &&
    'id' in product &&
    product.id === productId &&
    'optionGroups' in product &&
    Array.isArray(product.optionGroups)
  );
}

function responseErrorMessage(payload: unknown) {
  if (
    payload &&
    typeof payload === 'object' &&
    'message' in payload &&
    typeof payload.message === 'string'
  ) {
    return payload.message;
  }
  return 'Não foi possível carregar as opções deste item. Tente novamente.';
}

export function CartItemEditor({ storeSlug, item, storeOpen, onClose }: CartItemEditorProps) {
  const [retryKey, setRetryKey] = useState(0);
  const [detailState, setDetailState] = useState<DetailState>({
    status: 'loading',
    detail: null,
  });

  useEffect(() => {
    const controller = new AbortController();

    void fetch(
      `/api/storefront/${encodeURIComponent(storeSlug)}/products/${encodeURIComponent(item.productId)}`,
      {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        signal: controller.signal,
      },
    )
      .then(async (response) => {
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok) throw new Error(responseErrorMessage(payload));
        if (!isProductDetailResponse(payload, item.productId)) {
          throw new Error('Os detalhes recebidos são inválidos. Tente novamente.');
        }
        setDetailState({ status: 'success', detail: payload.product });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setDetailState({
          status: 'error',
          detail: null,
          error:
            error instanceof Error
              ? error.message
              : 'Não foi possível carregar as opções deste item. Tente novamente.',
        });
      });

    return () => controller.abort();
  }, [item.productId, retryKey, storeSlug]);

  const product: PublicStorefrontProductSummaryDto = {
    id: item.productId,
    name: item.productName,
    description: null,
    imageUrl: item.imageUrl ?? null,
    imageAssetId: item.imageAssetId ?? null,
    basePrice: item.basePrice,
    isFeatured: false,
    isSoldOut: false,
  };

  return (
    <ProductModal
      product={product}
      detail={detailState.detail}
      detailStatus={detailState.status}
      detailError={detailState.error}
      onRetry={() => {
        setDetailState({ status: 'loading', detail: null });
        setRetryKey((current) => current + 1);
      }}
      onClose={onClose}
      storeOpen={storeOpen}
      cartItem={item}
    />
  );
}

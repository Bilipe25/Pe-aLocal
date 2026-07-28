'use client';

import { useEffect, useState } from 'react';

import { ProductModal } from '@/components/storefront/product-modal';
import type {
  PublicCartRecommendationDto,
  PublicStorefrontProductDetailDto,
  PublicStorefrontProductDetailResponseDto,
  PublicStorefrontProductSummaryDto,
} from '@/types/storefront';

interface RecommendationProductConfiguratorProps {
  recommendation: PublicCartRecommendationDto;
  storeSlug: string;
  storeOpen: boolean;
  onClose: () => void;
  onAdded: (productId: string) => void;
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
  return 'Não foi possível carregar as opções deste produto. Tente novamente.';
}

export function RecommendationProductConfigurator({
  recommendation,
  storeSlug,
  storeOpen,
  onClose,
  onAdded,
}: RecommendationProductConfiguratorProps) {
  const [retryKey, setRetryKey] = useState(0);
  const [detailState, setDetailState] = useState<DetailState>({
    status: 'loading',
    detail: null,
  });

  useEffect(() => {
    const controller = new AbortController();

    void fetch(
      `/api/storefront/${encodeURIComponent(storeSlug)}/products/${encodeURIComponent(recommendation.id)}`,
      {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        signal: controller.signal,
      },
    )
      .then(async (response) => {
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok) throw new Error(responseErrorMessage(payload));
        if (!isProductDetailResponse(payload, recommendation.id)) {
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
              : 'Não foi possível carregar as opções deste produto. Tente novamente.',
        });
      });

    return () => controller.abort();
  }, [recommendation.id, retryKey, storeSlug]);

  const product: PublicStorefrontProductSummaryDto = {
    id: recommendation.id,
    name: recommendation.name,
    description: null,
    imageUrl: recommendation.imageUrl,
    imageAssetId: recommendation.imageAssetId,
    basePrice: recommendation.basePrice,
    isFeatured: recommendation.isFeatured,
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
      onAdded={onAdded}
      storeOpen={storeOpen}
    />
  );
}

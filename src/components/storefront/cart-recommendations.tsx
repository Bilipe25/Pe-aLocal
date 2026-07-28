'use client';

import { Check, LoaderCircle, Plus, RefreshCw, SlidersHorizontal } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { ProductImage } from '@/components/storefront/product-image';
import { reportStorefrontEvent } from '@/lib/checkout/telemetry';
import { formatCurrency } from '@/lib/utils';
import { useCartStore } from '@/stores/cart-store';
import type {
  PublicCartRecommendationDto,
  PublicCartRecommendationsResponseDto,
} from '@/types/storefront';

const RecommendationProductConfigurator = dynamic(
  () =>
    import('@/components/storefront/recommendation-product-configurator').then(
      (module) => module.RecommendationProductConfigurator,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="storefront-cart-editor-loading" role="status" aria-live="polite">
        <LoaderCircle className="animate-spin" aria-hidden="true" />
        Carregando opções…
      </div>
    ),
  },
);

type RecommendationState =
  | { status: 'loading'; recommendations: PublicCartRecommendationDto[] }
  | { status: 'success'; recommendations: PublicCartRecommendationDto[] }
  | { status: 'error'; recommendations: PublicCartRecommendationDto[] };

interface CartRecommendationsProps {
  storeSlug: string;
  storeOpen: boolean;
}

function isRecommendation(value: unknown): value is PublicCartRecommendationDto {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  const category = candidate.category;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    Number.isSafeInteger(candidate.basePrice) &&
    typeof candidate.isAvailable === 'boolean' &&
    typeof candidate.isFeatured === 'boolean' &&
    typeof candidate.requiresConfiguration === 'boolean' &&
    (candidate.imageUrl === null || typeof candidate.imageUrl === 'string') &&
    (candidate.imageAssetId === null || typeof candidate.imageAssetId === 'string') &&
    Boolean(category) &&
    typeof category === 'object' &&
    typeof (category as Record<string, unknown>).id === 'string' &&
    typeof (category as Record<string, unknown>).name === 'string'
  );
}

function isRecommendationResponse(value: unknown): value is PublicCartRecommendationsResponseDto {
  return (
    value !== null &&
    typeof value === 'object' &&
    'recommendations' in value &&
    Array.isArray(value.recommendations) &&
    value.recommendations.length <= 8 &&
    value.recommendations.every(isRecommendation)
  );
}

export function CartRecommendations({ storeSlug, storeOpen }: CartRecommendationsProps) {
  const items = useCartStore((state) => state.items);
  const addItem = useCartStore((state) => state.addItem);
  const removeQuantity = useCartStore((state) => state.removeQuantity);
  const productIdsKey = useMemo(
    () => [...new Set(items.map((item) => item.productId))].sort().join('|'),
    [items],
  );
  const hasCartProducts = productIdsKey.length > 0;
  const [retryKey, setRetryKey] = useState(0);
  const [state, setState] = useState<RecommendationState>({
    status: 'loading',
    recommendations: [],
  });
  const [pendingProductId, setPendingProductId] = useState<string | null>(null);
  const [addedProductId, setAddedProductId] = useState<string | null>(null);
  const [addedProductName, setAddedProductName] = useState<string | null>(null);
  const [selectedRecommendation, setSelectedRecommendation] =
    useState<PublicCartRecommendationDto | null>(null);
  const feedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const addFrameRef = useRef<number | null>(null);
  const viewedKeyRef = useRef<string | null>(null);
  const sectionRef = useRef<HTMLElement | null>(null);
  const trackRef = useRef<HTMLUListElement | null>(null);
  const configurationAddedRef = useRef(false);
  const restoreInteractionRef = useRef<{
    index: number;
    scrollLeft: number;
    shouldRestoreFocus: boolean;
  } | null>(null);
  const currentProductIds = useMemo(
    () => new Set(productIdsKey ? productIdsKey.split('|') : []),
    [productIdsKey],
  );
  const visibleRecommendations = useMemo(
    () =>
      state.recommendations.filter((recommendation) => !currentProductIds.has(recommendation.id)),
    [currentProductIds, state.recommendations],
  );

  useEffect(() => {
    if (!storeOpen || !hasCartProducts) {
      return;
    }

    const controller = new AbortController();
    const productIds = productIdsKey.split('|');

    void fetch(`/api/storefront/${encodeURIComponent(storeSlug)}/recommendations`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ productIds }),
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok || !isRecommendationResponse(payload)) {
          throw new Error('Resposta de recomendações inválida.');
        }
        setState({ status: 'success', recommendations: payload.recommendations });
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setState({ status: 'error', recommendations: [] });
      });

    return () => controller.abort();
  }, [hasCartProducts, productIdsKey, retryKey, storeOpen, storeSlug]);

  useEffect(() => {
    if (state.status !== 'success' || visibleRecommendations.length === 0) return;
    const viewedKey = visibleRecommendations.map((recommendation) => recommendation.id).join(',');
    if (viewedKeyRef.current === viewedKey) return;

    const section = sectionRef.current;
    if (!section || typeof IntersectionObserver === 'undefined') {
      viewedKeyRef.current = viewedKey;
      reportStorefrontEvent(storeSlug, { event: 'recommendation_viewed' });
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting || viewedKeyRef.current === viewedKey) return;
        viewedKeyRef.current = viewedKey;
        reportStorefrontEvent(storeSlug, { event: 'recommendation_viewed' });
        observer.disconnect();
      },
      { threshold: 0.25 },
    );
    observer.observe(section);
    return () => observer.disconnect();
  }, [state.status, storeSlug, visibleRecommendations]);

  useEffect(() => {
    const pending = restoreInteractionRef.current;
    if (!pending || selectedRecommendation) return;

    const track = trackRef.current;
    if (track) {
      const maxScroll = Math.max(0, track.scrollWidth - track.clientWidth);
      track.scrollLeft = Math.min(pending.scrollLeft, maxScroll);

      if (pending.shouldRestoreFocus) {
        const actions = Array.from(
          track.querySelectorAll<HTMLButtonElement>('[data-recommendation-action]'),
        );
        const nextAction = actions[Math.min(pending.index, actions.length - 1)];
        if (nextAction) nextAction.focus({ preventScroll: true });
        else track.focus({ preventScroll: true });
      }
    } else if (pending.shouldRestoreFocus) {
      const summaryAction = document.querySelector<HTMLElement>(
        '[data-cart-summary-action]:not(:disabled)',
      );
      const summary = document.querySelector<HTMLElement>('[data-cart-summary]');
      (summaryAction ?? summary)?.focus({ preventScroll: true });
    }

    restoreInteractionRef.current = null;
  }, [productIdsKey, selectedRecommendation, visibleRecommendations.length]);

  useEffect(
    () => () => {
      if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current);
      if (addFrameRef.current !== null) cancelAnimationFrame(addFrameRef.current);
    },
    [],
  );

  function markAdded(product: PublicCartRecommendationDto) {
    setAddedProductId(product.id);
    setAddedProductName(product.name);
    reportStorefrontEvent(storeSlug, { event: 'recommendation_added', productId: product.id });
    if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current);
    feedbackTimeoutRef.current = setTimeout(() => {
      setAddedProductId(null);
      setAddedProductName(null);
    }, 2_000);
  }

  function rememberInteraction(recommendationId: string, trigger: HTMLButtonElement) {
    const track = trackRef.current;
    if (!track) return;
    const actions = Array.from(
      track.querySelectorAll<HTMLButtonElement>('[data-recommendation-action]'),
    );
    restoreInteractionRef.current = {
      index: Math.max(
        0,
        actions.findIndex((action) => action.dataset.productId === recommendationId),
      ),
      scrollLeft: track.scrollLeft,
      shouldRestoreFocus: document.activeElement === trigger,
    };
  }

  function announceDirectAddition(
    product: PublicCartRecommendationDto,
    itemId: string,
    quantityAdded: number,
  ) {
    markAdded(product);
    toast.success('Adicionado à sacola', {
      description: `${product.name} foi incluído no pedido.`,
      action: {
        label: 'Desfazer',
        onClick: () => removeQuantity(itemId, quantityAdded),
      },
    });
  }

  function handleRecommendation(
    recommendation: PublicCartRecommendationDto,
    trigger: HTMLButtonElement,
  ) {
    rememberInteraction(recommendation.id, trigger);
    reportStorefrontEvent(storeSlug, {
      event: 'recommendation_clicked',
      productId: recommendation.id,
    });

    if (recommendation.requiresConfiguration) {
      configurationAddedRef.current = false;
      setSelectedRecommendation(recommendation);
      return;
    }

    setPendingProductId(recommendation.id);
    addFrameRef.current = requestAnimationFrame(() => {
      const result = addItem({
        productId: recommendation.id,
        productName: recommendation.name,
        basePrice: recommendation.basePrice,
        quantity: 1,
        notes: '',
        selectedOptions: [],
        unitPrice: recommendation.basePrice,
        imageUrl: recommendation.imageUrl,
        imageAssetId: recommendation.imageAssetId,
        imageAlt: recommendation.name,
      });
      setPendingProductId(null);
      addFrameRef.current = null;

      if (result.quantityAdded === 0) {
        restoreInteractionRef.current = null;
        toast.error('Limite de 99 unidades atingido');
        return;
      }
      announceDirectAddition(recommendation, result.itemId, result.quantityAdded);
    });
  }

  if (!storeOpen || !hasCartProducts) return null;
  const showSection = state.status !== 'success' || visibleRecommendations.length > 0;

  return (
    <>
      {showSection && (
        <section
          ref={sectionRef}
          className="storefront-cart-recommendations"
          aria-labelledby="cart-recommendations-title"
        >
          <div className="storefront-cart-recommendations-heading">
            <div>
              <h2 id="cart-recommendations-title">Que tal adicionar algo?</h2>
              <p>Complete seu pedido com estas sugestões.</p>
            </div>
            {state.status === 'loading' && visibleRecommendations.length > 0 && (
              <LoaderCircle className="animate-spin" aria-label="Atualizando sugestões" />
            )}
          </div>

          {state.status === 'loading' && visibleRecommendations.length === 0 && (
            <>
              <div className="storefront-cart-recommendation-skeletons" aria-hidden="true">
                {[0, 1, 2].map((index) => (
                  <span key={index} className="storefront-cart-recommendation-skeleton" />
                ))}
              </div>
              <span className="sr-only" role="status">
                Carregando sugestões.
              </span>
            </>
          )}

          {visibleRecommendations.length > 0 && (
            <ul
              ref={trackRef}
              className="storefront-cart-recommendation-track"
              aria-label="Sugestões para completar o pedido"
              tabIndex={0}
            >
              {visibleRecommendations.map((recommendation) => {
                const pending = pendingProductId === recommendation.id;
                const added = addedProductId === recommendation.id;
                const actionLabel = recommendation.requiresConfiguration
                  ? `Configurar ${recommendation.name} por ${formatCurrency(recommendation.basePrice)}`
                  : `Adicionar ${recommendation.name} ao carrinho por ${formatCurrency(recommendation.basePrice)}`;

                return (
                  <li key={recommendation.id} className="storefront-cart-recommendation-card">
                    <ProductImage
                      name={recommendation.name}
                      imageUrl={recommendation.imageUrl}
                      imageAssetId={recommendation.imageAssetId}
                      sizes="64px"
                      width={128}
                    />
                    <div className="storefront-cart-recommendation-copy">
                      <h3>{recommendation.name}</h3>
                      <strong>{formatCurrency(recommendation.basePrice)}</strong>
                    </div>
                    <button
                      type="button"
                      className={`storefront-cart-recommendation-add ${added ? 'is-added' : ''}`}
                      aria-label={
                        added ? `${recommendation.name} adicionado ao carrinho` : actionLabel
                      }
                      aria-busy={pending}
                      disabled={pending}
                      data-product-id={recommendation.id}
                      data-recommendation-action
                      onClick={(event) => handleRecommendation(recommendation, event.currentTarget)}
                    >
                      {pending ? (
                        <LoaderCircle className="animate-spin" aria-hidden="true" />
                      ) : added ? (
                        <Check aria-hidden="true" />
                      ) : recommendation.requiresConfiguration ? (
                        <SlidersHorizontal aria-hidden="true" />
                      ) : (
                        <Plus aria-hidden="true" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {state.status === 'error' && visibleRecommendations.length === 0 && (
            <button
              type="button"
              className="storefront-cart-recommendations-retry"
              onClick={() => {
                setState({ status: 'loading', recommendations: [] });
                setRetryKey((current) => current + 1);
              }}
            >
              <RefreshCw aria-hidden="true" />
              Tentar carregar sugestões
            </button>
          )}
        </section>
      )}
      <span className="sr-only" role="status" aria-live="polite">
        {addedProductName ? `${addedProductName} adicionado ao carrinho.` : ''}
      </span>

      {selectedRecommendation && (
        <RecommendationProductConfigurator
          recommendation={selectedRecommendation}
          storeSlug={storeSlug}
          storeOpen={storeOpen}
          onClose={() => {
            if (!configurationAddedRef.current) restoreInteractionRef.current = null;
            configurationAddedRef.current = false;
            setSelectedRecommendation(null);
          }}
          onAdded={(productId) => {
            if (productId === selectedRecommendation.id) {
              configurationAddedRef.current = true;
              markAdded(selectedRecommendation);
            }
          }}
        />
      )}
    </>
  );
}

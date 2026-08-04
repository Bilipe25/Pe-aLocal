'use client';

import { Ban, Check, History, LoaderCircle, RotateCcw, SlidersHorizontal } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { ProductImage } from '@/components/storefront/product-image';
import { reportStorefrontEvent } from '@/lib/checkout/telemetry';
import { formatCurrency } from '@/lib/utils';
import { useCartStore } from '@/stores/cart-store';
import type {
  PublicRecentPurchaseProductDto,
  PublicStorefrontProductSummaryDto,
} from '@/types/storefront';

interface RecentPurchasesSectionProps {
  products: PublicRecentPurchaseProductDto[];
  storeSlug: string;
  storeOpen: boolean;
  showImages: boolean;
  onOpenProduct: (product: PublicStorefrontProductSummaryDto) => void;
}

export function RecentPurchasesSection({
  products,
  storeSlug,
  storeOpen,
  showImages,
  onOpenProduct,
}: RecentPurchasesSectionProps) {
  const items = useCartStore((state) => state.items);
  const addItem = useCartStore((state) => state.addItem);
  const removeQuantity = useCartStore((state) => state.removeQuantity);
  const sectionRef = useRef<HTMLElement | null>(null);
  const viewedProductsRef = useRef<string | null>(null);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const additionFrameRef = useRef<number | null>(null);
  const [pendingProductId, setPendingProductId] = useState<string | null>(null);
  const [addedProduct, setAddedProduct] = useState<{ id: string; name: string } | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const viewedKey = products.map((product) => product.id).join(',');
    if (!viewedKey || viewedProductsRef.current === viewedKey) return;

    const section = sectionRef.current;
    if (!section || typeof IntersectionObserver === 'undefined') {
      viewedProductsRef.current = viewedKey;
      reportStorefrontEvent(storeSlug, { event: 'recent_purchases_section_viewed' });
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting || viewedProductsRef.current === viewedKey) return;
        viewedProductsRef.current = viewedKey;
        reportStorefrontEvent(storeSlug, { event: 'recent_purchases_section_viewed' });
        observer.disconnect();
      },
      { threshold: 0.25 },
    );
    observer.observe(section);
    return () => observer.disconnect();
  }, [products, storeSlug]);

  useEffect(
    () => () => {
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
      if (additionFrameRef.current !== null) cancelAnimationFrame(additionFrameRef.current);
    },
    [],
  );

  function openProduct(product: PublicRecentPurchaseProductDto, position: number) {
    reportStorefrontEvent(storeSlug, {
      event: 'recent_purchase_product_clicked',
      productId: product.id,
      position,
    });
    onOpenProduct(product);
  }

  function orderAgain(product: PublicRecentPurchaseProductDto, position: number) {
    reportStorefrontEvent(storeSlug, {
      event: 'recent_purchase_product_clicked',
      productId: product.id,
      position,
    });
    if (product.requiresConfiguration) {
      onOpenProduct(product);
      return;
    }
    if (!storeOpen || !product.isAvailable || product.isSoldOut || pendingProductId) return;

    setPendingProductId(product.id);
    additionFrameRef.current = requestAnimationFrame(() => {
      additionFrameRef.current = null;
      const result = addItem({
        productId: product.id,
        productName: product.name,
        basePrice: product.basePrice,
        quantity: 1,
        notes: '',
        selectedOptions: [],
        unitPrice: product.basePrice,
        imageUrl: product.imageUrl,
        imageAssetId: product.imageAssetId,
        imageAlt: product.name,
      });
      setPendingProductId(null);

      if (result.quantityAdded === 0) {
        toast.error('Limite de 99 unidades atingido');
        return;
      }

      reportStorefrontEvent(storeSlug, {
        event: 'recent_purchase_product_added',
        productId: product.id,
        position,
      });
      setAddedProduct({ id: product.id, name: product.name });
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
      feedbackTimerRef.current = setTimeout(() => setAddedProduct(null), 2_000);
      toast.success(result.merged ? 'Quantidade atualizada' : 'Adicionado à sacola', {
        description: result.merged
          ? `Mais uma unidade de ${product.name} incluída.`
          : `${product.name} foi incluído no pedido.`,
        action: {
          label: 'Desfazer',
          onClick: () => removeQuantity(result.itemId, result.quantityAdded),
        },
      });
    });
  }

  if (products.length === 0) return null;

  const visibleProducts = expanded ? products : products.slice(0, 5);
  const hasMore = !expanded && products.length > 5;

  return (
    <section
      ref={sectionRef}
      className="storefront-recent-section"
      aria-labelledby="recent-purchases-title"
    >
      <div className="storefront-recent-heading">
        <span className="storefront-recent-heading-icon" aria-hidden="true">
          <History />
        </span>
        <div>
          <h2 id="recent-purchases-title">Peça de novo</h2>
          <p>Seus sabores recentes, prontos para voltar à sacola.</p>
        </div>
      </div>

      <ul className="storefront-recent-track" aria-label="Produtos comprados recentemente">
        {visibleProducts.map((product, position) => {
          const pending = pendingProductId === product.id;
          const wasAdded = addedProduct?.id === product.id;
          const isUnavailable = !product.isAvailable || product.isSoldOut;
          
          let quantityInCart = 0;
          if (!product.requiresConfiguration) {
             const cartItem = items.find(
               (item) => item.productId === product.id && item.selectedOptions.length === 0 && item.notes === ''
             );
             if (cartItem) quantityInCart = cartItem.quantity;
          } else {
             quantityInCart = items.filter((item) => item.productId === product.id).reduce((sum, item) => sum + item.quantity, 0);
          }

          const actionLabel = isUnavailable
            ? `Produto indisponível`
            : product.requiresConfiguration
              ? `Revisar opções de ${product.name} por ${formatCurrency(product.basePrice)}`
              : `Pedir ${product.name} novamente por ${formatCurrency(product.basePrice)}`;

          return (
            <li key={product.id} className={`storefront-recent-card ${isUnavailable ? 'is-disabled' : ''}`}>
              <button
                type="button"
                className={`storefront-recent-product ${showImages ? '' : 'has-no-image'}`}
                onClick={() => openProduct(product, position)}
                aria-label={`Ver ${product.name}`}
              >
                {showImages ? (
                  <span className="storefront-recent-media">
                    <ProductImage
                      name={product.name}
                      imageUrl={product.imageUrl}
                      imageAssetId={product.imageAssetId}
                      sizes="(max-width: 639px) 5rem, 5.5rem"
                      width={384}
                    />
                  </span>
                ) : null}
                <span className="storefront-recent-copy">
                  <span className="storefront-recent-badge">
                    {isUnavailable ? (
                      <>
                        <Ban aria-hidden="true" />
                        Indisponível
                      </>
                    ) : (
                      <>
                        <RotateCcw aria-hidden="true" />
                        Você já pediu
                      </>
                    )}
                  </span>
                  <span className="storefront-recent-name">{product.name}</span>
                  <span className="storefront-recent-price">
                    {formatCurrency(product.basePrice)}
                  </span>
                </span>
              </button>
              <button
                type="button"
                className={`storefront-recent-action ${wasAdded ? 'is-added' : ''}`}
                onClick={() => orderAgain(product, position)}
                disabled={!storeOpen || pending || isUnavailable}
                aria-label={storeOpen ? actionLabel : `Loja fechada. ${product.name} indisponível`}
                aria-busy={pending}
              >
                {pending ? (
                  <LoaderCircle className="animate-spin" aria-hidden="true" />
                ) : wasAdded ? (
                  <Check aria-hidden="true" />
                ) : product.requiresConfiguration ? (
                  <SlidersHorizontal aria-hidden="true" />
                ) : (
                  <RotateCcw aria-hidden="true" />
                )}
                <span>{product.requiresConfiguration ? 'Revisar opções' : 'Pedir de novo'}</span>
                
                {quantityInCart > 0 && !isUnavailable && (
                   <span className="storefront-recent-action-badge" aria-label={`${quantityInCart} na sacola`}>
                     {quantityInCart}
                   </span>
                )}
              </button>
            </li>
          );
        })}
        {hasMore && (
          <li className="storefront-recent-card storefront-recent-more">
            <button
              type="button"
              className="storefront-recent-more-btn"
              onClick={() => setExpanded(true)}
            >
              Ver todos os {products.length} recentes
            </button>
          </li>
        )}
      </ul>

      <span className="sr-only" role="status" aria-live="polite">
        {addedProduct ? `${addedProduct.name} adicionado à sacola.` : ''}
      </span>
    </section>
  );
}

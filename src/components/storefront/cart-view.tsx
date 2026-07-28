'use client';

import {
  ArrowLeft,
  Loader2,
  Minus,
  Pencil,
  Plus,
  RefreshCw,
  ShoppingBag,
  Store,
  Ticket,
  Trash2,
  Truck,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { ProductImage } from '@/components/storefront/product-image';
import { Button } from '@/components/ui/button';
import { useCartQuote, type CartFulfillmentModality } from '@/hooks/use-cart-quote';
import { writeCheckoutCartHandoff } from '@/lib/checkout/checkout-draft';
import { formatCurrency } from '@/lib/utils';
import {
  MAX_CART_ITEM_QUANTITY,
  selectCartCouponCode,
  selectCartRevision,
  subscribeToCartStorage,
  useCartStore,
} from '@/stores/cart-store';

const CartItemEditor = dynamic(
  () => import('@/components/storefront/cart-item-editor').then((module) => module.CartItemEditor),
  {
    ssr: false,
    loading: () => (
      <div className="storefront-cart-editor-loading" role="status">
        <Loader2 className="animate-spin" aria-hidden="true" />
        Carregando editor do item…
      </div>
    ),
  },
);

interface CartViewProps {
  storeId: string;
  storeSlug: string;
  storeName?: string;
  logoImageUrl?: string | null;
  logoImageAssetId?: string | null;
  acceptingOrders: boolean;
  unavailableReason: string;
  deliveryEnabled?: boolean;
  pickupEnabled?: boolean;
}

function formatPostalCode(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
}

function getSessionStorage() {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function buildCartCheckoutHref(
  storeSlug: string,
  modality: CartFulfillmentModality,
  couponCode: string | null,
) {
  const query = new URLSearchParams({
    modality,
    ...(couponCode ? { coupon: couponCode } : {}),
  });
  return `/${storeSlug}/checkout?${query.toString()}`;
}

export function CartView({
  storeId,
  storeSlug,
  storeName = 'Loja',
  logoImageUrl = null,
  logoImageAssetId = null,
  acceptingOrders,
  unavailableReason,
  deliveryEnabled = false,
  pickupEnabled = true,
}: CartViewProps) {
  const items = useCartStore((state) => state.items);
  const activeStoreId = useCartStore((state) => state.storeId);
  const setStore = useCartStore((state) => state.setStore);
  const updateQuantity = useCartStore((state) => state.updateQuantity);
  const removeItem = useCartStore((state) => state.removeItem);
  const clearCart = useCartStore((state) => state.clearCart);
  const getSnapshot = useCartStore((state) => state.getSnapshot);
  const restoreSnapshot = useCartStore((state) => state.restoreSnapshot);
  const couponCode = useCartStore(selectCartCouponCode);
  const revision = useCartStore(selectCartRevision);
  const setCouponCode = useCartStore((state) => state.setCouponCode);
  const getTotal = useCartStore((state) => state.getTotal);
  const [modality, setModality] = useState<CartFulfillmentModality>(
    pickupEnabled ? 'PICKUP' : 'DELIVERY',
  );
  const [postalCode, setPostalCode] = useState('');
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const editingTriggerRef = useRef<HTMLButtonElement | null>(null);
  const localTotal = getTotal();

  useEffect(() => {
    setStore(storeId, storeSlug);
    return subscribeToCartStorage(storeId, storeSlug);
  }, [setStore, storeId, storeSlug]);

  const quoteState = useCartQuote({
    storeSlug,
    items,
    revision,
    modality,
    deliveryPostalCode: postalCode,
    couponCode,
  });
  const quoteLines = useMemo(
    () => new Map(quoteState.quote?.lines.map((line) => [line.lineId, line]) ?? []),
    [quoteState.quote],
  );
  const lineIssues = useMemo(() => {
    const grouped = new Map<string, string[]>();
    for (const issue of quoteState.quote?.issues ?? []) {
      if (!issue.lineId) continue;
      grouped.set(issue.lineId, [...(grouped.get(issue.lineId) ?? []), issue.message]);
    }
    return grouped;
  }, [quoteState.quote]);
  const globalIssues =
    quoteState.quote?.issues.filter(
      (issue) => !issue.lineId && issue.code !== 'MIN_ORDER_NOT_REACHED',
    ) ?? [];
  const subtotal = quoteState.quote?.subtotal ?? localTotal;
  const total = quoteState.quote?.total ?? localTotal;
  const canCheckout =
    acceptingOrders && quoteState.status === 'success' && Boolean(quoteState.quote?.canCheckout);
  const checkoutHref = buildCartCheckoutHref(storeSlug, modality, couponCode);
  const editingItem = items.find((item) => item.id === editingItemId) ?? null;

  function closeItemEditor() {
    setEditingItemId(null);
    requestAnimationFrame(() => editingTriggerRef.current?.focus());
  }

  function restoreSafely(snapshot: ReturnType<typeof getSnapshot>, expectedRevision: number) {
    if (restoreSnapshot(snapshot, expectedRevision)) return;
    toast.info('A sacola mudou depois desta ação', {
      description: 'Para proteger as alterações mais recentes, não foi possível desfazer.',
    });
  }

  function handleClearCart() {
    const snapshot = getSnapshot();
    const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
    const undoRevision = clearCart();
    toast('Sacola limpa', {
      description: `${itemCount} ${itemCount === 1 ? 'item foi removido' : 'itens foram removidos'}.`,
      action: {
        label: 'Desfazer',
        onClick: () => restoreSafely(snapshot, undoRevision),
      },
      duration: 6000,
    });
  }

  function handleRemoveItem(itemId: string, productName: string) {
    const snapshot = getSnapshot();
    const undoRevision = removeItem(itemId);
    toast(`${productName} removido`, {
      description: 'O item saiu da sua sacola.',
      action: {
        label: 'Desfazer',
        onClick: () => restoreSafely(snapshot, undoRevision),
      },
      duration: 6000,
    });
  }

  function preserveCheckoutContext() {
    writeCheckoutCartHandoff(getSessionStorage(), storeId, {
      modality,
      ...(modality === 'DELIVERY' && postalCode.replace(/\D/g, '').length === 8
        ? { deliveryPostalCode: postalCode.replace(/\D/g, '') }
        : {}),
      ...(couponCode ? { couponCode } : {}),
    });
  }

  if (activeStoreId !== storeId) {
    return (
      <main className="storefront-cart-state" role="status" aria-live="polite">
        <Loader2 className="animate-spin" aria-hidden="true" />
        Carregando sua sacola…
      </main>
    );
  }

  if (items.length === 0) {
    return (
      <main className="storefront-cart-empty">
        <div className="storefront-cart-empty-icon">
          <ShoppingBag aria-hidden="true" />
        </div>
        <h1>Sua sacola está vazia</h1>
        <p>Escolha seus favoritos no cardápio e volte para finalizar.</p>
        <Button asChild className="storefront-primary-action">
          <Link href={`/${storeSlug}`}>
            <ArrowLeft aria-hidden="true" />
            Explorar cardápio
          </Link>
        </Button>
      </main>
    );
  }

  return (
    <main className="storefront-cart-page" aria-busy={quoteState.status === 'loading'}>
      <StoreCartHeader
        storeSlug={storeSlug}
        storeName={storeName}
        logoImageUrl={logoImageUrl}
        logoImageAssetId={logoImageAssetId}
      />
      <header className="storefront-cart-heading">
        <div>
          <h1>Sua sacola</h1>
          <p>
            {items.reduce((sum, item) => sum + item.quantity, 0)}{' '}
            {items.reduce((sum, item) => sum + item.quantity, 0) === 1 ? 'item' : 'itens'}
          </p>
        </div>
        <button type="button" onClick={handleClearCart} className="storefront-cart-clear">
          <Trash2 aria-hidden="true" />
          Limpar
        </button>
      </header>

      <div className="storefront-cart-layout">
        <div className="storefront-cart-content">
          {(deliveryEnabled || pickupEnabled) && (
            <section
              className="storefront-cart-fulfillment"
              aria-labelledby="cart-fulfillment-title"
            >
              <div className="storefront-cart-section-heading">
                <h2 id="cart-fulfillment-title">Como você quer receber?</h2>
                <span>A taxa e o total são atualizados pela loja.</span>
              </div>
              <div className="storefront-cart-fulfillment-options">
                {pickupEnabled && (
                  <button
                    type="button"
                    aria-pressed={modality === 'PICKUP'}
                    className={modality === 'PICKUP' ? 'is-selected' : undefined}
                    onClick={() => setModality('PICKUP')}
                  >
                    <Store aria-hidden="true" />
                    <span>
                      <strong>Retirada</strong>
                      <small>Buscar no local</small>
                    </span>
                  </button>
                )}
                {deliveryEnabled && (
                  <button
                    type="button"
                    aria-pressed={modality === 'DELIVERY'}
                    className={modality === 'DELIVERY' ? 'is-selected' : undefined}
                    onClick={() => setModality('DELIVERY')}
                  >
                    <Truck aria-hidden="true" />
                    <span>
                      <strong>Entrega</strong>
                      <small>Receber no endereço</small>
                    </span>
                  </button>
                )}
              </div>
              {modality === 'DELIVERY' && (
                <div className="storefront-cart-postal">
                  <label htmlFor="cart-postal-code">CEP para entrega</label>
                  <input
                    id="cart-postal-code"
                    value={postalCode}
                    onChange={(event) => setPostalCode(formatPostalCode(event.target.value))}
                    inputMode="numeric"
                    autoComplete="postal-code"
                    placeholder="00000-000"
                    maxLength={9}
                  />
                  <p>Usaremos o CEP para confirmar cobertura, prazo e taxa.</p>
                </div>
              )}
            </section>
          )}

          <section className="storefront-cart-items" aria-labelledby="cart-items-title">
            <div className="storefront-cart-section-heading">
              <h2 id="cart-items-title">Itens do pedido</h2>
              {quoteState.status === 'loading' && (
                <span className="storefront-cart-quote-status" role="status">
                  <Loader2 className="animate-spin" aria-hidden="true" />
                  Atualizando valores…
                </span>
              )}
            </div>
            <div className="storefront-cart-lines">
              {items.map((item) => {
                const quotedLine = quoteLines.get(item.id);
                const issues = lineIssues.get(item.id) ?? [];
                const displayName = quotedLine?.productName ?? item.productName;
                const displayOptions = quotedLine?.options ?? item.selectedOptions;
                const displayUnitPrice = quotedLine?.unitPrice ?? item.unitPrice;
                const displayTotal = quotedLine?.itemTotal ?? item.unitPrice * item.quantity;
                const priceChanged = Boolean(quotedLine && quotedLine.unitPrice !== item.unitPrice);

                return (
                  <article
                    key={item.id}
                    className={`storefront-cart-line ${issues.length > 0 ? 'has-issue' : ''}`}
                  >
                    <div className="storefront-cart-line-media">
                      <ProductImage
                        name={displayName}
                        imageUrl={quotedLine?.imageUrl ?? item.imageUrl ?? null}
                        imageAssetId={quotedLine?.imageAssetId ?? item.imageAssetId ?? null}
                        sizes="64px"
                        width={192}
                      />
                    </div>
                    <div className="storefront-cart-line-main">
                      <div className="storefront-cart-line-copy">
                        <h3>{displayName}</h3>
                        {displayOptions.length > 0 && (
                          <p>{displayOptions.map((option) => option.name).join(', ')}</p>
                        )}
                        {item.notes && <p className="is-note">“{item.notes}”</p>}
                        <span>{formatCurrency(displayUnitPrice)} por unidade</span>
                        {priceChanged && <em>Preço atualizado pela loja</em>}
                        <button
                          type="button"
                          className="storefront-cart-line-edit"
                          onClick={(event) => {
                            editingTriggerRef.current = event.currentTarget;
                            setEditingItemId(item.id);
                          }}
                        >
                          <Pencil aria-hidden="true" />
                          Editar
                        </button>
                      </div>
                      <button
                        type="button"
                        aria-label={`Remover ${displayName} da sacola`}
                        onClick={() => handleRemoveItem(item.id, displayName)}
                        className="storefront-cart-line-remove"
                      >
                        <Trash2 aria-hidden="true" />
                      </button>
                      <div className="storefront-cart-line-actions">
                        <div className="storefront-cart-quantity">
                          <button
                            type="button"
                            aria-label={`Diminuir quantidade de ${displayName}`}
                            onClick={() => updateQuantity(item.id, item.quantity - 1)}
                            disabled={item.quantity <= 1}
                          >
                            <Minus aria-hidden="true" />
                          </button>
                          <output aria-live="polite" aria-label={`Quantidade de ${displayName}`}>
                            {item.quantity}
                          </output>
                          <button
                            type="button"
                            aria-label={`Aumentar quantidade de ${displayName}`}
                            aria-describedby={
                              item.quantity >= MAX_CART_ITEM_QUANTITY
                                ? `cart-quantity-limit-${item.id}`
                                : undefined
                            }
                            onClick={() => updateQuantity(item.id, item.quantity + 1)}
                            disabled={item.quantity >= MAX_CART_ITEM_QUANTITY}
                          >
                            <Plus aria-hidden="true" />
                          </button>
                        </div>
                        <strong>{formatCurrency(displayTotal)}</strong>
                      </div>
                      {item.quantity >= MAX_CART_ITEM_QUANTITY && (
                        <p id={`cart-quantity-limit-${item.id}`} role="status">
                          Limite de {MAX_CART_ITEM_QUANTITY} unidades.
                        </p>
                      )}
                      {issues.map((issue) => (
                        <p key={issue} className="storefront-cart-line-issue" role="alert">
                          {issue}
                        </p>
                      ))}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          <CartCouponSection
            key={couponCode ?? 'without-coupon'}
            couponCode={couponCode}
            appliedCoupon={quoteState.quote?.coupon ?? null}
            onCouponChange={setCouponCode}
          />

          {quoteState.status === 'waiting' && modality === 'DELIVERY' && (
            <div className="storefront-cart-notice" role="status">
              Informe um CEP com 8 números para calcular a entrega.
            </div>
          )}
          {quoteState.status === 'error' && (
            <div className="storefront-cart-notice is-error" role="alert">
              <span>{quoteState.error}</span>
              <button type="button" onClick={quoteState.retry}>
                <RefreshCw aria-hidden="true" />
                Tentar novamente
              </button>
            </div>
          )}
          {globalIssues.map((issue) => (
            <div
              key={`${issue.code}-${issue.message}`}
              className="storefront-cart-notice"
              role="alert"
            >
              {issue.message}
            </div>
          ))}
          {quoteState.quote && quoteState.quote.missingForMinimum > 0 && (
            <div className="storefront-cart-minimum" role="status">
              <div>
                <strong>
                  Faltam {formatCurrency(quoteState.quote.missingForMinimum)} para o pedido mínimo
                </strong>
                <span>Pedido mínimo: {formatCurrency(quoteState.quote.minOrderValue)}</span>
              </div>
              <progress
                value={quoteState.quote.subtotal}
                max={quoteState.quote.minOrderValue}
                aria-label="Progresso para atingir o pedido mínimo"
              />
            </div>
          )}
        </div>

        <aside className="storefront-cart-summary" aria-labelledby="cart-summary-title">
          <h2 id="cart-summary-title">Resumo</h2>
          <dl>
            <div>
              <dt>Subtotal</dt>
              <dd>{formatCurrency(subtotal)}</dd>
            </div>
            {quoteState.quote && quoteState.quote.discount > 0 && (
              <div className="is-discount">
                <dt>Desconto</dt>
                <dd>− {formatCurrency(quoteState.quote.discount)}</dd>
              </div>
            )}
            {modality === 'DELIVERY' && quoteState.quote && (
              <div>
                <dt>Entrega</dt>
                <dd>{formatCurrency(quoteState.quote.deliveryFee)}</dd>
              </div>
            )}
            <div className="is-total">
              <dt>Total</dt>
              <dd>{formatCurrency(total)}</dd>
            </div>
          </dl>

          {!acceptingOrders && (
            <p className="storefront-cart-summary-message" role="status">
              {unavailableReason}
            </p>
          )}
          {quoteState.status === 'loading' ? (
            <Button type="button" className="storefront-primary-action" disabled>
              <Loader2 className="animate-spin" aria-hidden="true" />
              Atualizando…
            </Button>
          ) : quoteState.status === 'error' ? (
            <Button type="button" className="storefront-primary-action" onClick={quoteState.retry}>
              <RefreshCw aria-hidden="true" />
              Atualizar valores
            </Button>
          ) : canCheckout ? (
            <Button asChild className="storefront-primary-action">
              <Link href={checkoutHref} onClick={preserveCheckoutContext}>
                Ir para checkout · {formatCurrency(total)}
              </Link>
            </Button>
          ) : (
            <Button type="button" className="storefront-primary-action" disabled>
              {quoteState.status === 'waiting' ? 'Informe o CEP' : 'Revise a sacola'}
            </Button>
          )}
          <p className="storefront-cart-summary-caption">
            Valores e disponibilidade confirmados antes de criar o pedido.
          </p>
        </aside>
      </div>
      {editingItem && (
        <CartItemEditor
          key={editingItem.id}
          storeSlug={storeSlug}
          item={editingItem}
          storeOpen={acceptingOrders}
          onClose={closeItemEditor}
        />
      )}
    </main>
  );
}

function CartCouponSection({
  couponCode,
  appliedCoupon,
  onCouponChange,
}: {
  couponCode: string | null;
  appliedCoupon: { code: string; discount: number } | null;
  onCouponChange: (couponCode: string | null) => number;
}) {
  const [draft, setDraft] = useState(couponCode ?? '');

  function submitCoupon(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = draft.trim().toUpperCase();
    setDraft(normalized);
    onCouponChange(normalized || null);
  }

  return (
    <section className="storefront-cart-coupon" aria-labelledby="cart-coupon-title">
      <div className="storefront-cart-section-heading">
        <h2 id="cart-coupon-title">
          <Ticket aria-hidden="true" />
          Cupom
        </h2>
        <span>Se tiver um código, aplique antes de continuar.</span>
      </div>
      <form onSubmit={submitCoupon}>
        <label htmlFor="cart-coupon-code" className="sr-only">
          Código do cupom
        </label>
        <input
          id="cart-coupon-code"
          value={draft}
          onChange={(event) => setDraft(event.target.value.toUpperCase())}
          placeholder="DIGITE O CÓDIGO"
          maxLength={32}
          autoCapitalize="characters"
          autoComplete="off"
        />
        <Button type="submit" variant="outline">
          {couponCode ? 'Atualizar' : 'Aplicar'}
        </Button>
      </form>
      {appliedCoupon && (
        <div className="storefront-cart-coupon-applied" role="status">
          <Ticket aria-hidden="true" />
          <span>
            <strong>{appliedCoupon.code}</strong>
            {formatCurrency(appliedCoupon.discount)} de desconto
          </span>
          <button
            type="button"
            onClick={() => {
              setDraft('');
              onCouponChange(null);
            }}
          >
            Remover
          </button>
        </div>
      )}
    </section>
  );
}

function StoreCartHeader({
  storeSlug,
  storeName,
  logoImageUrl,
  logoImageAssetId,
}: {
  storeSlug: string;
  storeName: string;
  logoImageUrl: string | null;
  logoImageAssetId: string | null;
}) {
  return (
    <header className="storefront-cart-store-header">
      <Link href={`/${storeSlug}`} aria-label="Voltar ao cardápio">
        <ArrowLeft aria-hidden="true" />
      </Link>
      <span className="storefront-cart-store-logo" aria-hidden="true">
        {logoImageUrl || logoImageAssetId ? (
          <ProductImage
            name={storeName}
            imageUrl={logoImageUrl}
            imageAssetId={logoImageAssetId}
            sizes="40px"
            width={96}
          />
        ) : (
          <Store />
        )}
      </span>
      <p>
        <span>Sacola de</span>
        <strong>{storeName}</strong>
      </p>
    </header>
  );
}

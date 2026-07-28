'use client';

import {
  ArrowLeft,
  Loader2,
  Minus,
  MoreVertical,
  Pencil,
  Plus,
  RefreshCw,
  ShoppingBag,
  Store,
  Trash2,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { ProductImage } from '@/components/storefront/product-image';
import { CartRecommendations } from '@/components/storefront/cart-recommendations';
import { Button } from '@/components/ui/button';
import { useCartQuote, type CartFulfillmentModality } from '@/hooks/use-cart-quote';
import { formatCurrency } from '@/lib/utils';
import {
  MAX_CART_ITEM_QUANTITY,
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

export function buildCartCheckoutHref(storeSlug: string) {
  return `/${storeSlug}/checkout`;
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
  const revision = useCartStore(selectCartRevision);
  const getTotal = useCartStore((state) => state.getTotal);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const editingTriggerRef = useRef<HTMLButtonElement | null>(null);
  const localTotal = getTotal();

  useEffect(() => {
    setStore(storeId, storeSlug);
    return subscribeToCartStorage(storeId, storeSlug);
  }, [setStore, storeId, storeSlug]);

  const quoteModality: CartFulfillmentModality = pickupEnabled
    ? 'PICKUP'
    : deliveryEnabled
      ? 'DELIVERY'
      : 'PICKUP';
  const quoteState = useCartQuote({
    storeSlug,
    items,
    revision,
    modality: quoteModality,
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
  const total = subtotal;
  const canCheckout =
    acceptingOrders && quoteState.status === 'success' && Boolean(quoteState.quote?.canCheckout);
  const checkoutHref = buildCartCheckoutHref(storeSlug);
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
                  <CartLineItem
                    key={item.id}
                    itemId={item.id}
                    displayName={displayName}
                    displayOptions={displayOptions}
                    displayUnitPrice={displayUnitPrice}
                    displayTotal={displayTotal}
                    quantity={item.quantity}
                    notes={item.notes}
                    imageUrl={quotedLine?.imageUrl ?? item.imageUrl ?? null}
                    imageAssetId={quotedLine?.imageAssetId ?? item.imageAssetId ?? null}
                    priceChanged={priceChanged}
                    issues={issues}
                    onRemove={() => handleRemoveItem(item.id, displayName)}
                    onEdit={(trigger) => {
                      editingTriggerRef.current = trigger;
                      setEditingItemId(item.id);
                    }}
                    onQuantityChange={(qty) => updateQuantity(item.id, qty)}
                  />
                );
              })}
            </div>
          </section>

          <CartRecommendations storeSlug={storeSlug} storeOpen={acceptingOrders} />

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

        <aside
          className="storefront-cart-summary"
          aria-labelledby="cart-summary-title"
          data-cart-summary
          tabIndex={-1}
        >
          <h2 id="cart-summary-title">Resumo</h2>
          <dl>
            <div className="is-total">
              <dt>Subtotal dos itens</dt>
              <dd>{formatCurrency(total)}</dd>
            </div>
          </dl>

          {!acceptingOrders && (
            <p className="storefront-cart-summary-message" role="status">
              {unavailableReason}
            </p>
          )}
          {quoteState.status === 'loading' ? (
            <Button
              type="button"
              className="storefront-primary-action"
              data-cart-summary-action
              disabled
            >
              <Loader2 className="animate-spin" aria-hidden="true" />
              Atualizando…
            </Button>
          ) : quoteState.status === 'error' ? (
            <Button
              type="button"
              className="storefront-primary-action"
              data-cart-summary-action
              onClick={quoteState.retry}
            >
              <RefreshCw aria-hidden="true" />
              Atualizar valores
            </Button>
          ) : canCheckout ? (
            <Button asChild className="storefront-primary-action">
              <Link href={checkoutHref} data-cart-summary-action>
                Ir para checkout · {formatCurrency(total)}
              </Link>
            </Button>
          ) : (
            <Button
              type="button"
              className="storefront-primary-action"
              data-cart-summary-action
              disabled
            >
              {quoteState.status === 'waiting' ? 'Atualizando valores…' : 'Revise a sacola'}
            </Button>
          )}
          <p className="storefront-cart-summary-caption">
            Recebimento, cupom e total final são definidos no checkout.
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

function CartLineItem({
  itemId,
  displayName,
  displayOptions,
  displayUnitPrice,
  displayTotal,
  quantity,
  notes,
  imageUrl,
  imageAssetId,
  priceChanged,
  issues,
  onRemove,
  onEdit,
  onQuantityChange,
}: {
  itemId: string;
  displayName: string;
  displayOptions: { name: string }[];
  displayUnitPrice: number;
  displayTotal: number;
  quantity: number;
  notes: string | null | undefined;
  imageUrl: string | null;
  imageAssetId: string | null;
  priceChanged: boolean;
  issues: string[];
  onRemove: () => void;
  onEdit: (trigger: HTMLButtonElement) => void;
  onQuantityChange: (qty: number) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  useEffect(() => {
    if (!menuOpen) return;
    function handleClickOutside(event: MouseEvent | TouchEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('pointerdown', handleClickOutside);
    return () => document.removeEventListener('pointerdown', handleClickOutside);
  }, [menuOpen]);

  return (
    <article className={`storefront-cart-line ${issues.length > 0 ? 'has-issue' : ''}`}>
      <div className="storefront-cart-line-media">
        <ProductImage
          name={displayName}
          imageUrl={imageUrl}
          imageAssetId={imageAssetId}
          sizes="48px"
          width={96}
        />
      </div>

      <div className="storefront-cart-line-body">
        <div className="storefront-cart-line-row">
          <div className="storefront-cart-line-info">
            <h3>{displayName}</h3>
            {displayOptions.length > 0 && (
              <p>{displayOptions.map((option) => option.name).join(' · ')}</p>
            )}
            {notes && <p className="is-note">“{notes}”</p>}
            {priceChanged && <em>Preço atualizado</em>}
          </div>
          <div className="storefront-cart-line-end">
            <strong>{formatCurrency(displayTotal)}</strong>
            {quantity > 1 && (
              <span className="storefront-cart-line-unit">
                {formatCurrency(displayUnitPrice)} cada
              </span>
            )}
          </div>
        </div>

        <div className="storefront-cart-line-controls">
          <div className="storefront-cart-quantity">
            <button
              type="button"
              className="is-decrease"
              aria-label={`Diminuir quantidade de ${displayName}`}
              onClick={() => onQuantityChange(quantity - 1)}
              disabled={quantity <= 1}
            >
              <Minus aria-hidden="true" />
            </button>
            <output aria-live="polite" aria-label={`Quantidade de ${displayName}`}>
              {quantity}
            </output>
            <button
              type="button"
              className="is-increase"
              aria-label={`Aumentar quantidade de ${displayName}`}
              aria-describedby={
                quantity >= MAX_CART_ITEM_QUANTITY
                  ? `cart-quantity-limit-${itemId}`
                  : undefined
              }
              onClick={() => onQuantityChange(quantity + 1)}
              disabled={quantity >= MAX_CART_ITEM_QUANTITY}
            >
              <Plus aria-hidden="true" />
            </button>
          </div>

          <div className="storefront-cart-line-menu-wrap" ref={menuRef}>
            <button
              type="button"
              ref={triggerRef}
              className="storefront-cart-line-menu-trigger"
              onClick={() => setMenuOpen((prev) => !prev)}
              aria-label={`Opções de ${displayName}`}
              aria-expanded={menuOpen}
            >
              <MoreVertical aria-hidden="true" />
            </button>
            {menuOpen && (
              <div className="storefront-cart-line-menu" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  onClick={(event) => {
                    closeMenu();
                    onEdit(event.currentTarget);
                  }}
                >
                  <Pencil aria-hidden="true" />
                  Editar item
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="is-danger"
                  onClick={() => {
                    closeMenu();
                    onRemove();
                  }}
                >
                  <Trash2 aria-hidden="true" />
                  Remover
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {quantity >= MAX_CART_ITEM_QUANTITY && (
        <p id={`cart-quantity-limit-${itemId}`} className="storefront-cart-line-issue" role="status">
          Limite de {MAX_CART_ITEM_QUANTITY} unidades.
        </p>
      )}
      {issues.map((issue) => (
        <p key={issue} className="storefront-cart-line-issue" role="alert">
          {issue}
        </p>
      ))}
    </article>
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

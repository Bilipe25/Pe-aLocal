'use client';

import Link from 'next/link';
import { ChevronRight, ShoppingBag } from 'lucide-react';
import { type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from 'react';
import {
  selectCartItemCount,
  selectCartRevision,
  selectCartStoreId,
  selectCartStoreSlug,
  selectCartTotal,
  useCartStore,
} from '@/stores/cart-store';
import { cn, formatCurrency } from '@/lib/utils';

const SWIPE_START_THRESHOLD = 12;
const SWIPE_DISMISS_RATIO = 0.4;
const SWIPE_DISMISS_VELOCITY = 0.55;
const FAB_EXIT_DURATION = 200;
const MOBILE_VIEWPORT_QUERY = '(max-width: 767px)';

type DismissDirection = 'left' | 'right';

interface SwipeState {
  pointerId: number | null;
  startX: number;
  startY: number;
  startTime: number;
  isDragging: boolean;
  isVertical: boolean;
  suppressClick: boolean;
}

const initialSwipeState = (): SwipeState => ({
  pointerId: null,
  startX: 0,
  startY: 0,
  startTime: 0,
  isDragging: false,
  isVertical: false,
  suppressClick: false,
});

function isMobileTouchGesture(event: ReactPointerEvent<HTMLElement>) {
  return (
    event.pointerType === 'touch' &&
    event.isPrimary !== false &&
    typeof window !== 'undefined' &&
    window.matchMedia(MOBILE_VIEWPORT_QUERY).matches
  );
}

export function CartFab({ storeId }: { storeId: string }) {
  const activeStoreId = useCartStore(selectCartStoreId);
  const storeSlug = useCartStore(selectCartStoreSlug);
  const count = useCartStore(selectCartItemCount);
  const total = useCartStore(selectCartTotal);
  const revision = useCartStore(selectCartRevision);
  const fabRef = useRef<HTMLDivElement>(null);
  const swipeRef = useRef<SwipeState>(initialSwipeState());
  const dismissTimerRef = useRef<number | null>(null);
  const previousRevisionRef = useRef(revision);
  const [dragOffset, setDragOffset] = useState(0);
  const [dragWidth, setDragWidth] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [dismissDirection, setDismissDirection] = useState<DismissDirection | null>(null);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    if (previousRevisionRef.current === revision) return;

    previousRevisionRef.current = revision;
    if (dismissTimerRef.current !== null) {
      window.clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
    setIsDismissed(false);
    setDismissDirection(null);
    setDragOffset(0);
    setIsDragging(false);
  }, [revision]);

  useEffect(
    () => () => {
      if (dismissTimerRef.current !== null) {
        window.clearTimeout(dismissTimerRef.current);
      }
    },
    [],
  );

  const getFabWidth = () => fabRef.current?.getBoundingClientRect().width || 1;

  const resetSwipe = () => {
    swipeRef.current = initialSwipeState();
    setIsDragging(false);
    setDragOffset(0);
  };

  const dismiss = (direction: DismissDirection) => {
    const exitDistance = getFabWidth() + 48;
    setIsDragging(false);
    setDismissDirection(direction);
    setDragOffset(direction === 'right' ? exitDistance : -exitDistance);

    dismissTimerRef.current = window.setTimeout(() => {
      setIsDismissed(true);
      dismissTimerRef.current = null;
    }, FAB_EXIT_DURATION);
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isMobileTouchGesture(event) || dismissDirection) return;

    swipeRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startTime: event.timeStamp,
      isDragging: false,
      isVertical: false,
      suppressClick: false,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const swipe = swipeRef.current;
    if (swipe.pointerId !== event.pointerId || swipe.isVertical || dismissDirection) return;

    const deltaX = event.clientX - swipe.startX;
    const deltaY = event.clientY - swipe.startY;

    if (!swipe.isDragging) {
      if (Math.abs(deltaX) < SWIPE_START_THRESHOLD && Math.abs(deltaY) < SWIPE_START_THRESHOLD) {
        return;
      }
      if (Math.abs(deltaY) >= Math.abs(deltaX)) {
        swipe.isVertical = true;
        return;
      }

      swipe.isDragging = true;
      swipe.suppressClick = true;
      setIsDragging(true);
    }

    event.preventDefault();
    const limit = getFabWidth();
    setDragWidth(limit);
    setDragOffset(Math.max(-limit, Math.min(limit, deltaX)));
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const swipe = swipeRef.current;
    if (swipe.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - swipe.startX;
    const elapsed = Math.max(1, event.timeStamp - swipe.startTime);
    const velocity = Math.abs(deltaX) / elapsed;
    const shouldDismiss =
      swipe.isDragging &&
      (Math.abs(deltaX) >= getFabWidth() * SWIPE_DISMISS_RATIO ||
        (Math.abs(deltaX) >= SWIPE_START_THRESHOLD && velocity >= SWIPE_DISMISS_VELOCITY));

    const direction: DismissDirection = deltaX >= 0 ? 'right' : 'left';
    const suppressClick = swipe.suppressClick;
    swipeRef.current = initialSwipeState();
    swipeRef.current.suppressClick = suppressClick;

    if (shouldDismiss) {
      dismiss(direction);
      return;
    }

    setIsDragging(false);
    setDragOffset(0);
  };

  const handlePointerCancel = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (swipeRef.current.pointerId !== event.pointerId) return;
    resetSwipe();
  };

  const handleClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (!swipeRef.current.suppressClick) return;
    event.preventDefault();
    event.stopPropagation();
    swipeRef.current.suppressClick = false;
  };

  if (activeStoreId !== storeId || count === 0 || !storeSlug || isDismissed) return null;

  const isDismissing = dismissDirection !== null;
  const dragProgress = Math.min(1, Math.abs(dragOffset) / dragWidth);
  const dragStyle =
    isDragging || isDismissing
      ? {
          transform: `translateX(${dragOffset}px)`,
          opacity: isDismissing ? 0 : Math.max(0.4, 1 - dragProgress * 0.6),
        }
      : undefined;

  return (
    <div
      ref={fabRef}
      className={cn(
        'storefront-cart-fab',
        isDragging && 'is-dragging',
        dismissDirection && `is-dismissing-${dismissDirection}`,
      )}
      style={dragStyle}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    >
      <Link
        href={`/${storeSlug}/cart`}
        className="storefront-cart-fab-link"
        aria-label={`Ver carrinho com ${count} ${count === 1 ? 'item' : 'itens'}, total ${formatCurrency(total)}`}
        onClick={handleClick}
      >
        <span className="storefront-cart-fab-leading">
          <span className="storefront-cart-fab-icon">
            <ShoppingBag aria-hidden="true" />
            <span key={count} className="storefront-cart-count" aria-hidden="true">
              {count}
            </span>
          </span>
          <span className="storefront-cart-fab-copy">
            <strong>Ver carrinho</strong>
            <span>
              {count} {count === 1 ? 'item' : 'itens'}
            </span>
          </span>
        </span>
        <span className="storefront-cart-fab-total">{formatCurrency(total)}</span>
        <ChevronRight className="storefront-cart-fab-chevron" aria-hidden="true" />
      </Link>
    </div>
  );
}

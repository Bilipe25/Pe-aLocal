'use client';

import { RotateCcw, ShoppingBag } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { ProductImage } from '@/components/storefront/product-image';
import { formatCurrency } from '@/lib/utils';
import { useCartStore } from '@/stores/cart-store';
import type { PublicRecentOrderDto } from '@/types/storefront';

interface RecentOrdersSectionProps {
  storeId: string;
  storeSlug: string;
  orders: PublicRecentOrderDto[];
}

export function RecentOrdersSection({ storeId, storeSlug, orders }: RecentOrdersSectionProps) {
  const router = useRouter();

  if (!orders || orders.length === 0) {
    return null;
  }

  const handleReorder = (order: PublicRecentOrderDto) => {
    if (!order.items || order.items.length === 0) {
      router.push(`/${storeSlug}`);
      return;
    }

    useCartStore.getState().setStore(storeId, storeSlug);

    let addedCount = 0;
    for (const item of order.items) {
      useCartStore.getState().addItem({
        productId: item.productId,
        productName: item.productName,
        basePrice: item.unitPrice,
        unitPrice: item.unitPrice,
        quantity: item.quantity,
        notes: item.notes ?? '',
        selectedOptions: item.options.map((opt, idx) => ({
          id: `opt-${idx}`,
          name: opt.name,
          price: opt.price,
        })),
      });
      addedCount += item.quantity;
    }

    toast.success(
      `${addedCount} ${addedCount === 1 ? 'item adicionado' : 'itens adicionados'} à sua sacola!`,
    );
  };

  return (
    <section
      className="storefront-recent-orders-section my-4 space-y-2.5 px-4 sm:px-6"
      aria-labelledby="recent-orders-title"
    >
      <div className="flex items-center justify-between">
        <h2 id="recent-orders-title" className="font-display text-base sm:text-lg font-bold text-tinta">
          Peça de novo
        </h2>
        <span className="text-[11px] text-text-muted font-medium">Pedidos anteriores</span>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2 pt-0.5 scrollbar-none -mx-4 px-4 sm:-mx-6 sm:px-6">
        {orders.map((order) => {
          const firstThumb = order.thumbnails[0];
          const secondThumb = order.thumbnails[1];
          const thirdThumb = order.thumbnails[2];

          return (
            <article
              key={order.id}
              className="flex w-[260px] sm:w-[290px] shrink-0 items-center gap-3 rounded-2xl border border-tinta/10 bg-surface p-2.5 shadow-2xs transition-all hover:border-tinta/20 hover:shadow-xs"
            >
              {/* Left Compact Square Mosaic (80x80px) */}
              <div className="relative flex h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-surface-muted p-0.5 gap-0.5 border border-tinta/5">
                <div className="relative flex-1 overflow-hidden rounded-lg bg-surface">
                  {firstThumb ? (
                    <ProductImage
                      name={firstThumb.productName}
                      imageUrl={firstThumb.imageUrl}
                      imageAssetId={firstThumb.imageAssetId}
                      sizes="80px"
                      width={80}
                      fallback={<ShoppingBag className="h-5 w-5 text-text-muted" />}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <ShoppingBag className="h-5 w-5 text-text-muted" />
                    </div>
                  )}
                </div>

                {secondThumb && (
                  <div className="flex w-2/5 flex-col gap-0.5">
                    <div className="relative flex-1 overflow-hidden rounded-md bg-surface">
                      <ProductImage
                        name={secondThumb.productName}
                        imageUrl={secondThumb.imageUrl}
                        imageAssetId={secondThumb.imageAssetId}
                        sizes="40px"
                        width={40}
                        fallback={<ShoppingBag className="h-3 w-3 text-text-muted" />}
                      />
                    </div>
                    {thirdThumb && (
                      <div className="relative flex-1 overflow-hidden rounded-md bg-surface">
                        {order.extraThumbnailsCount > 0 ? (
                          <div className="flex h-full w-full items-center justify-center bg-tinta/10 text-tinta font-bold text-[10px]">
                            +{order.extraThumbnailsCount + 1}
                          </div>
                        ) : (
                          <ProductImage
                            name={thirdThumb.productName}
                            imageUrl={thirdThumb.imageUrl}
                            imageAssetId={thirdThumb.imageAssetId}
                            sizes="40px"
                            width={40}
                            fallback={<ShoppingBag className="h-3 w-3 text-text-muted" />}
                          />
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Right Column Content */}
              <div className="flex flex-1 flex-col justify-between min-w-0 h-20 py-0.5">
                <div className="space-y-0.5">
                  <p className="text-xs font-semibold text-tinta line-clamp-2 leading-tight">
                    {order.itemsSummary}
                    {order.extraItemsCount > 0 && (
                      <span className="ml-1 text-text-muted font-normal">
                        +{order.extraItemsCount}
                      </span>
                    )}
                  </p>
                  <p className="text-[10px] text-text-muted font-medium truncate">
                    {order.totalItemCount} {order.totalItemCount === 1 ? 'item' : 'itens'} · {order.timeAgoLabel}
                  </p>
                </div>

                <div className="flex items-center justify-between gap-1 pt-1 border-t border-tinta/5">
                  <span className="font-mono text-xs font-extrabold text-tinta shrink-0">
                    {formatCurrency(order.totalCents)}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleReorder(order)}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-brand-600 hover:text-brand-700 transition-colors py-0.5 px-1 -mr-1 rounded-md hover:bg-brand-50"
                  >
                    <RotateCcw className="h-3 w-3" aria-hidden="true" />
                    Pedir de novo
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

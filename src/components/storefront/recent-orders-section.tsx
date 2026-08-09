'use client';

import { ShoppingBag } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { ProductImage } from '@/components/storefront/product-image';
import { repeatOrderIntoCart } from '@/features/storefront/repeat-order';
import type { PublicRecentOrderDto } from '@/types/storefront';

interface RecentOrdersSectionProps {
  storeId: string;
  storeSlug: string;
  orders: PublicRecentOrderDto[];
}

export function RecentOrdersSection({ storeId, storeSlug, orders }: RecentOrdersSectionProps) {
  const [repeatingOrderId, setRepeatingOrderId] = useState<string | null>(null);

  if (!orders || orders.length === 0) {
    return null;
  }

  const handleReorder = async (order: PublicRecentOrderDto) => {
    setRepeatingOrderId(order.id);
    try {
      const result = await repeatOrderIntoCart({
        storeId,
        storeSlug,
        reference: { orderId: order.id },
      });
      if (result.addedQuantity > 0) {
        toast.success(
          `${result.addedQuantity} ${result.addedQuantity === 1 ? 'item adicionado' : 'itens adicionados'} com os valores atuais.`,
        );
      }
      if (result.issueCount > 0) {
        toast.warning(
          `${result.issueCount} ${result.issueCount === 1 ? 'item precisa' : 'itens precisam'} ser revisado no cardápio.`,
        );
      }
      if (result.addedQuantity === 0 && result.issueCount === 0) {
        toast.info('Este pedido não possui itens disponíveis para repetir.');
      }
    } catch {
      toast.error('Não foi possível revisar este pedido agora. Tente novamente.');
    } finally {
      setRepeatingOrderId(null);
    }
  };

  return (
    <section
      className="storefront-recent-orders-section my-3 space-y-2 px-4 sm:my-4 sm:space-y-2.5 sm:px-6"
      aria-labelledby="recent-orders-title"
    >
      <div>
        <h2
          id="recent-orders-title"
          className="storefront-recent-order-title font-display text-[15px] font-bold sm:text-lg"
        >
          Peça de novo
        </h2>
      </div>

      <div className="flex snap-x snap-mandatory scrollbar-none gap-2.5 overflow-x-auto pt-0.5 pr-4 pb-1.5 sm:-mx-6 sm:gap-3 sm:px-6 sm:pb-2">
        {orders.map((order) => {
          const firstThumb = order.thumbnails[0];
          const secondThumb = order.thumbnails[1];
          const thirdThumb = order.thumbnails[2];
          const visibleItems = order.items.slice(0, 2);
          const hiddenItemsCount = Math.max(0, order.items.length - visibleItems.length);

          return (
            <article
              key={order.id}
              className="storefront-recent-order-card flex h-[5.5rem] w-[min(13.875rem,calc(100vw-2rem))] shrink-0 snap-start items-center gap-2 rounded-xl border p-2 sm:h-24 sm:w-[300px] sm:gap-3 sm:p-2.5"
            >
              <div className="storefront-recent-order-media bg-surface-muted border-tinta/5 relative flex h-14 w-14 shrink-0 gap-0.5 overflow-hidden rounded-lg border p-0.5 sm:h-20 sm:w-20 sm:rounded-xl">
                <div className="bg-surface relative flex-1 overflow-hidden rounded-lg">
                  {firstThumb ? (
                    <ProductImage
                      name={firstThumb.productName}
                      imageUrl={firstThumb.imageUrl}
                      imageAssetId={firstThumb.imageAssetId}
                      sizes="(max-width: 639px) 56px, 80px"
                      width={56}
                      fallback={<ShoppingBag className="text-text-muted h-5 w-5" />}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <ShoppingBag className="text-text-muted h-5 w-5" />
                    </div>
                  )}
                </div>

                {secondThumb && (
                  <div className="flex w-2/5 flex-col gap-0.5">
                    <div className="bg-surface relative flex-1 overflow-hidden rounded-md">
                      <ProductImage
                        name={secondThumb.productName}
                        imageUrl={secondThumb.imageUrl}
                        imageAssetId={secondThumb.imageAssetId}
                        sizes="36px"
                        width={36}
                        fallback={<ShoppingBag className="text-text-muted h-3 w-3" />}
                      />
                    </div>
                    {thirdThumb && (
                      <div className="bg-surface relative flex-1 overflow-hidden rounded-md">
                        {order.extraThumbnailsCount > 0 ? (
                          <div className="bg-tinta/10 text-tinta flex h-full w-full items-center justify-center text-xs font-bold">
                            +{order.extraThumbnailsCount + 1}
                          </div>
                        ) : (
                          <ProductImage
                            name={thirdThumb.productName}
                            imageUrl={thirdThumb.imageUrl}
                            imageAssetId={thirdThumb.imageAssetId}
                            sizes="36px"
                            width={36}
                            fallback={<ShoppingBag className="text-text-muted h-3 w-3" />}
                          />
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="flex min-w-0 flex-1 flex-col justify-between self-stretch py-0.5">
                <ul className="min-w-0 space-y-0.5 text-[13px] leading-tight font-semibold sm:text-sm">
                  {visibleItems.map((item, index) => (
                    <li key={`${item.productId}-${index}`} className="truncate">
                      <span className="text-text-muted mr-1 font-medium">{item.quantity}×</span>
                      {item.productName}
                    </li>
                  ))}
                  {hiddenItemsCount > 0 && (
                    <li className="storefront-recent-order-meta truncate font-medium">
                      +{hiddenItemsCount} {hiddenItemsCount === 1 ? 'item' : 'itens'}
                    </li>
                  )}
                </ul>

                <button
                  type="button"
                  onClick={() => void handleReorder(order)}
                  disabled={repeatingOrderId !== null}
                  aria-label={`Pedir novamente o pedido ${order.orderNumber}`}
                  className="inline-flex self-start text-xs font-semibold whitespace-nowrap text-[var(--store-button-background)] transition-colors hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--store-button-background)] disabled:cursor-wait disabled:opacity-60 sm:text-sm"
                >
                  {repeatingOrderId === order.id ? 'Revisando…' : 'Pedir de novo'}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

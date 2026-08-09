'use client';

import { RotateCcw, ShoppingBag } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { ProductImage } from '@/components/storefront/product-image';
import { repeatOrderIntoCart } from '@/features/storefront/repeat-order';
import { formatCurrency } from '@/lib/utils';
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
      className="storefront-recent-orders-section my-4 space-y-2.5 px-4 sm:px-6"
      aria-labelledby="recent-orders-title"
    >
      <div className="flex items-center justify-between">
        <h2
          id="recent-orders-title"
          className="storefront-recent-order-title font-display text-base font-bold sm:text-lg"
        >
          Peça de novo
        </h2>
        <span className="storefront-recent-order-meta text-sm font-medium">Pedidos anteriores</span>
      </div>

      <div className="-mx-4 flex scrollbar-none gap-3 overflow-x-auto px-4 pt-0.5 pb-2 sm:-mx-6 sm:px-6">
        {orders.map((order) => {
          const firstThumb = order.thumbnails[0];
          const secondThumb = order.thumbnails[1];
          const thirdThumb = order.thumbnails[2];

          return (
            <article
              key={order.id}
              className="storefront-recent-order-card flex w-[272px] shrink-0 items-center gap-3 rounded-2xl border p-2.5 transition-all sm:w-[300px]"
            >
              {/* Left Compact Square Mosaic (80x80px) */}
              <div className="bg-surface-muted border-tinta/5 relative flex h-20 w-20 shrink-0 gap-0.5 overflow-hidden rounded-xl border p-0.5">
                <div className="bg-surface relative flex-1 overflow-hidden rounded-lg">
                  {firstThumb ? (
                    <ProductImage
                      name={firstThumb.productName}
                      imageUrl={firstThumb.imageUrl}
                      imageAssetId={firstThumb.imageAssetId}
                      sizes="80px"
                      width={80}
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
                        sizes="40px"
                        width={40}
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
                            sizes="40px"
                            width={40}
                            fallback={<ShoppingBag className="text-text-muted h-3 w-3" />}
                          />
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Right Column Content */}
              <div className="flex h-20 min-w-0 flex-1 flex-col justify-between py-0.5">
                <div className="space-y-0.5">
                  <p className="storefront-recent-order-summary line-clamp-2 text-sm leading-tight font-semibold">
                    {order.itemsSummary}
                    {order.extraItemsCount > 0 && (
                      <span className="text-text-muted ml-1 font-normal">
                        +{order.extraItemsCount}
                      </span>
                    )}
                  </p>
                  <p className="storefront-recent-order-meta truncate text-sm font-medium">
                    {order.totalItemCount} {order.totalItemCount === 1 ? 'item' : 'itens'} ·{' '}
                    {order.timeAgoLabel}
                  </p>
                </div>

                <div className="border-tinta/5 flex items-center justify-between gap-1 border-t pt-1">
                  <span className="storefront-recent-order-price shrink-0 font-mono text-sm font-extrabold">
                    {formatCurrency(order.totalCents)}
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleReorder(order)}
                    disabled={repeatingOrderId !== null}
                    aria-label={`Pedir novamente o pedido ${order.orderNumber}`}
                    className="storefront-recent-order-action inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm font-bold transition-colors disabled:cursor-wait disabled:opacity-60"
                  >
                    <RotateCcw className="h-3 w-3" aria-hidden="true" />
                    {repeatingOrderId === order.id ? 'Revisando…' : 'Pedir de novo'}
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

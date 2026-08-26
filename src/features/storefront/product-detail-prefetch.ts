import { storeAssetUrl } from '@/features/assets/urls';
import type { PublicStorefrontProductSummaryDto } from '@/types/storefront';

export const STOREFRONT_PRODUCT_DETAIL_PREFETCH_CONCURRENCY = 2;
const STOREFRONT_PRODUCT_DETAIL_PREFETCH_QUEUE_LIMIT = 4;

interface NetworkInformationLike {
  saveData?: boolean;
  effectiveType?: string;
}

interface NavigatorWithConnection {
  connection?: NetworkInformationLike;
}

export function allowsPassiveProductDetailPrefetch(
  navigatorValue: NavigatorWithConnection | undefined = typeof navigator === 'undefined'
    ? undefined
    : (navigator as NavigatorWithConnection),
) {
  const connection = navigatorValue?.connection;
  if (!connection) return true;
  if (connection.saveData) return false;
  return connection.effectiveType !== 'slow-2g' && connection.effectiveType !== '2g';
}

export function getFullscreenProductImageUrl(product: PublicStorefrontProductSummaryDto) {
  if (product.imageAssetId) return storeAssetUrl(product.imageAssetId, 768);
  return product.imageUrl;
}

type PrefetchPriority = 'viewport' | 'intent';

export class ProductDetailPrefetchQueue {
  private activeCount = 0;
  private disposed = false;
  private readonly scheduledIds = new Set<string>();
  private queue: PublicStorefrontProductSummaryDto[] = [];

  constructor(
    private readonly load: (product: PublicStorefrontProductSummaryDto) => Promise<unknown>,
    private readonly warmImage: (product: PublicStorefrontProductSummaryDto) => void,
    private readonly maxConcurrent = STOREFRONT_PRODUCT_DETAIL_PREFETCH_CONCURRENCY,
  ) {}

  enqueue(product: PublicStorefrontProductSummaryDto, priority: PrefetchPriority) {
    if (this.disposed || this.scheduledIds.has(product.id)) return false;
    if (this.queue.length >= STOREFRONT_PRODUCT_DETAIL_PREFETCH_QUEUE_LIMIT) {
      if (priority === 'viewport') return false;
      const displaced = this.queue.pop();
      if (displaced) this.scheduledIds.delete(displaced.id);
    }

    this.scheduledIds.add(product.id);
    if (priority === 'intent') this.queue.unshift(product);
    else this.queue.push(product);
    this.pump();
    return true;
  }

  dispose() {
    this.disposed = true;
    this.queue = [];
    this.scheduledIds.clear();
  }

  prioritizeExplicitRequest(productId: string) {
    const queuedIndex = this.queue.findIndex((product) => product.id === productId);
    if (queuedIndex < 0) return;
    this.queue.splice(queuedIndex, 1);
    this.scheduledIds.delete(productId);
  }

  private pump() {
    while (!this.disposed && this.activeCount < this.maxConcurrent && this.queue.length > 0) {
      const product = this.queue.shift();
      if (!product) return;
      this.activeCount += 1;
      this.warmImage(product);
      void this.load(product)
        .catch(() => undefined)
        .finally(() => {
          this.scheduledIds.delete(product.id);
          this.activeCount -= 1;
          this.pump();
        });
    }
  }
}

export function createFullscreenProductImageWarmer() {
  const warmedUrls = new Set<string>();
  const activeImages = new Map<string, HTMLImageElement>();

  return (product: PublicStorefrontProductSummaryDto) => {
    if (typeof window === 'undefined') return;
    const url = getFullscreenProductImageUrl(product);
    if (!url || warmedUrls.has(url)) return;

    warmedUrls.add(url);
    const image = new window.Image();
    image.decoding = 'async';
    image.fetchPriority = 'low';
    const release = () => activeImages.delete(url);
    image.onload = release;
    image.onerror = release;
    activeImages.set(url, image);
    image.src = url;
  };
}

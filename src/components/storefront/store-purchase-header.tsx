import { ArrowLeft, Store } from 'lucide-react';
import Link from 'next/link';

import { ProductImage } from '@/components/storefront/product-image';
import { cn } from '@/lib/utils';

interface StorePurchaseHeaderProps {
  backHref: string;
  backLabel: string;
  title: string;
  storeName: string;
  logoImageUrl?: string | null;
  logoImageAssetId?: string | null;
  className?: string;
}

export function StorePurchaseHeader({
  backHref,
  backLabel,
  title,
  storeName,
  logoImageUrl = null,
  logoImageAssetId = null,
  className,
}: StorePurchaseHeaderProps) {
  return (
    <header className={cn('storefront-purchase-header', className)}>
      <Link href={backHref} aria-label={backLabel}>
        <ArrowLeft aria-hidden="true" />
      </Link>
      <span className="storefront-purchase-logo" aria-hidden="true">
        {logoImageUrl || logoImageAssetId ? (
          <ProductImage
            name={storeName}
            imageUrl={logoImageUrl}
            imageAssetId={logoImageAssetId}
            sizes="40px"
            width={96}
            fallback={<Store />}
          />
        ) : (
          <Store />
        )}
      </span>
      <div className="storefront-purchase-copy">
        <h1>{title}</h1>
        <p>{storeName}</p>
      </div>
    </header>
  );
}

import { AlertTriangle } from 'lucide-react';
import type { EffectiveStoreAvailability } from '@/features/stores/availability';

interface StoreClosedBannerProps {
  availability: EffectiveStoreAvailability;
}

export function StoreClosedBanner({ availability }: StoreClosedBannerProps) {
  return (
    <div className="border-pimenta/20 bg-pimenta/5 border-b px-4 py-2.5">
      <div className="mx-auto flex max-w-2xl items-center gap-2 text-sm">
        <AlertTriangle className="storefront-action-text h-4 w-4 shrink-0" aria-hidden="true" />
        <p className="text-tinta">{availability.reason}</p>
      </div>
    </div>
  );
}

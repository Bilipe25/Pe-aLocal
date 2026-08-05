import { AlertTriangle, Clock, Info, PauseCircle } from 'lucide-react';
import type { EffectiveStoreAvailability } from '@/features/stores/availability';

interface StoreClosedBannerProps {
  availability: EffectiveStoreAvailability;
}

const STATUS_TITLE: Record<
  Exclude<EffectiveStoreAvailability['state'], 'OPEN'>,
  { label: string; icon: typeof AlertTriangle; tone: 'warning' | 'info' }
> = {
  CLOSED_BY_SCHEDULE: { label: 'Fechada agora', icon: Clock, tone: 'info' },
  MANUALLY_CLOSED: { label: 'Fechada agora', icon: AlertTriangle, tone: 'warning' },
  PAUSED: { label: 'Pedidos pausados', icon: PauseCircle, tone: 'warning' },
  TENANT_SUSPENDED: { label: 'Temporariamente indisponível', icon: AlertTriangle, tone: 'warning' },
  STORE_INACTIVE: { label: 'Temporariamente indisponível', icon: AlertTriangle, tone: 'warning' },
  NOT_READY: { label: 'Em preparação', icon: Info, tone: 'info' },
};

export function StoreClosedBanner({ availability }: StoreClosedBannerProps) {
  if (availability.acceptingOrders || availability.state === 'OPEN') return null;

  const status = STATUS_TITLE[availability.state];
  const Icon = status.icon;

  return (
    <div
      className={`storefront-closed-banner storefront-closed-banner-${status.tone}`}
      role="status"
      aria-live="polite"
    >
      <div className="storefront-closed-banner-inner">
        <span className="storefront-closed-banner-icon" aria-hidden="true">
          <Icon />
        </span>
        <div className="storefront-closed-banner-copy">
          <strong className="storefront-closed-banner-title">{status.label}</strong>
          <p className="storefront-closed-banner-reason">{availability.reason}</p>
        </div>
      </div>
    </div>
  );
}

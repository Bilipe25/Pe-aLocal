import { Banknote, CalendarDays, Clock, MapPin, Package } from 'lucide-react';

import { storeAssetSrcSet } from '@/features/assets/urls';
import { formatCurrency } from '@/lib/utils';
import type { StoreCustomizationConfig } from '@/schemas/customization';

interface OpeningHour {
  dayOfWeek: string;
  openTime: string;
  closeTime: string;
}

interface StoreHeaderProps {
  name: string;
  description: string | null;
  status: 'OPEN' | 'CLOSED' | 'PAUSED';
  estimatedTime?: string;
  minOrderValue?: number;
  deliveryEnabled?: boolean;
  pickupEnabled?: boolean;
  minDeliveryFee?: number | null;
  openingHours?: OpeningHour[];
  neighborhood?: string;
  city?: string;
  logoUrl: string | null;
  logoAssetId?: string | null;
  coverUrl: string | null;
  coverAssetId?: string | null;
  config: StoreCustomizationConfig;
}

const STATUS_CONFIG = {
  OPEN: { label: 'Aberta agora', classes: 'storefront-status-open' },
  CLOSED: { label: 'Fechada agora', classes: 'storefront-status-closed' },
  PAUSED: { label: 'Pedidos pausados', classes: 'storefront-status-paused' },
};

const DAY_LABELS: Record<string, string> = {
  MONDAY: 'Segunda-feira',
  TUESDAY: 'Terça-feira',
  WEDNESDAY: 'Quarta-feira',
  THURSDAY: 'Quinta-feira',
  FRIDAY: 'Sexta-feira',
  SATURDAY: 'Sábado',
  SUNDAY: 'Domingo',
};

export function StoreHeader({
  name,
  description,
  status,
  estimatedTime,
  minOrderValue = 0,
  deliveryEnabled = false,
  pickupEnabled = false,
  minDeliveryFee,
  openingHours = [],
  neighborhood,
  city,
  logoUrl,
  logoAssetId,
  coverUrl,
  coverAssetId,
  config,
}: StoreHeaderProps) {
  const statusInfo = STATUS_CONFIG[status];
  const summary = config.identity.shortDescription || description;
  const showCover = config.layout.showCover && Boolean(coverUrl);
  const deliveryLabel =
    minDeliveryFee && minDeliveryFee > 0
      ? `Entrega a partir de ${formatCurrency(minDeliveryFee)}`
      : 'Entrega disponível';
  const fulfillmentLabel =
    deliveryEnabled && pickupEnabled
      ? `${deliveryLabel} · Retirada disponível`
      : deliveryEnabled
        ? deliveryLabel
        : pickupEnabled
          ? 'Retirada disponível'
          : null;

  return (
    <header className="storefront-header">
      {showCover && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className="storefront-cover"
          src={coverUrl!}
          srcSet={coverAssetId ? storeAssetSrcSet(coverAssetId, [384, 768, 1280]) : undefined}
          sizes="100vw"
          alt=""
          width={1280}
          height={640}
          fetchPriority="high"
          decoding="async"
        />
      )}

      <div className="storefront-header-content">
        <div className="storefront-identity">
          {logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className="storefront-logo"
              src={logoUrl}
              srcSet={logoAssetId ? storeAssetSrcSet(logoAssetId, [96, 192, 384]) : undefined}
              sizes="72px"
              alt={`Logo de ${name}`}
              width={384}
              height={384}
              decoding="async"
            />
          )}

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="storefront-title break-words">{name}</h1>
                {config.layout.showSlogan && config.identity.slogan && (
                  <p className="storefront-slogan break-words">{config.identity.slogan}</p>
                )}
              </div>
              <span className={`storefront-status ${statusInfo.classes}`}>{statusInfo.label}</span>
            </div>

            {summary && <p className="storefront-description break-words">{summary}</p>}

            {(neighborhood || city) && (
              <p className="storefront-location">
                <MapPin className="h-4 w-4" aria-hidden="true" />
                Loja em {[neighborhood, city].filter(Boolean).join(', ')}
              </p>
            )}

            <div className="storefront-operational-info" aria-label="Informações para pedir">
              {estimatedTime && (
                <span className="storefront-operational-item">
                  <Clock className="h-4 w-4" aria-hidden="true" />
                  Preparo estimado: {estimatedTime}
                </span>
              )}
              {fulfillmentLabel && (
                <span className="storefront-operational-item">
                  <Package className="h-4 w-4" aria-hidden="true" />
                  {fulfillmentLabel}
                </span>
              )}
              {minOrderValue > 0 && (
                <span className="storefront-operational-item">
                  <Banknote className="h-4 w-4" aria-hidden="true" />
                  Pedido mínimo: {formatCurrency(minOrderValue)}
                </span>
              )}
              {openingHours.length > 0 && (
                <details className="storefront-hours">
                  <summary>
                    <CalendarDays className="h-4 w-4" aria-hidden="true" />
                    Ver horários
                  </summary>
                  <ul>
                    {openingHours.map((hour) => (
                      <li key={hour.dayOfWeek}>
                        <span>{DAY_LABELS[hour.dayOfWeek] ?? hour.dayOfWeek}</span>
                        <span className="font-mono">
                          {hour.openTime}–{hour.closeTime}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

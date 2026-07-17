import { Clock, MapPin } from 'lucide-react';

import type { StoreCustomizationConfig } from '@/schemas/customization';

interface StoreHeaderProps {
  name: string;
  description: string | null;
  status: 'OPEN' | 'CLOSED' | 'PAUSED';
  estimatedTime?: string;
  neighborhood?: string;
  city?: string;
  logoUrl: string | null;
  coverUrl: string | null;
  config: StoreCustomizationConfig;
}

const STATUS_CONFIG = {
  OPEN: { label: 'Aberta agora', classes: 'storefront-status-open' },
  CLOSED: { label: 'Fechada', classes: 'storefront-status-closed' },
  PAUSED: { label: 'Pausada', classes: 'storefront-status-paused' },
};

export function StoreHeader({
  name,
  description,
  status,
  estimatedTime,
  neighborhood,
  city,
  logoUrl,
  coverUrl,
  config,
}: StoreHeaderProps) {
  const statusInfo = STATUS_CONFIG[status];
  const summary = config.identity.shortDescription || description;
  const showCover = config.layout.showCover && Boolean(coverUrl);

  return (
    <header className="storefront-header">
      {showCover && (
        // A origem das imagens será normalizada pelo pipeline de assets na Fase 3.
        // eslint-disable-next-line @next/next/no-img-element
        <img className="storefront-cover" src={coverUrl!} alt="" fetchPriority="high" />
      )}

      <div className="storefront-header-content">
        <div className="storefront-identity">
          {logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="storefront-logo" src={logoUrl} alt={`Logo de ${name}`} />
          )}

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="storefront-title">{name}</h1>
                {config.layout.showSlogan && config.identity.slogan && (
                  <p className="storefront-slogan">{config.identity.slogan}</p>
                )}
              </div>
              <span className={`storefront-status ${statusInfo.classes}`}>{statusInfo.label}</span>
            </div>

            {summary && <p className="storefront-description">{summary}</p>}

            <div className="storefront-quick-info">
              {estimatedTime && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {estimatedTime}
                </span>
              )}
              {neighborhood && city && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  {neighborhood}, {city}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

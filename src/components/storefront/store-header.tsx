import { MapPin, Clock } from 'lucide-react';

interface StoreHeaderProps {
  name: string;
  description: string | null;
  status: 'OPEN' | 'CLOSED' | 'PAUSED';
  estimatedTime?: string;
  neighborhood?: string;
  city?: string;
}

const STATUS_CONFIG = {
  OPEN: { label: 'Aberta agora', classes: 'bg-erva text-white' },
  CLOSED: { label: 'Fechada', classes: 'bg-tinta/10 text-tinta/70' },
  PAUSED: { label: 'Pausada', classes: 'bg-pimenta/15 text-pimenta' },
};

export function StoreHeader({
  name,
  description,
  status,
  estimatedTime,
  neighborhood,
  city,
}: StoreHeaderProps) {
  const statusInfo = STATUS_CONFIG[status];

  return (
    <header className="border-b border-tinta/10 bg-papel">
      <div className="mx-auto max-w-2xl px-4 py-5">
        {/* Nome e status */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold text-tinta">{name}</h1>
            {description && (
              <p className="mt-1 text-sm text-tinta/60">{description}</p>
            )}
          </div>
          <span
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${statusInfo.classes}`}
          >
            {statusInfo.label}
          </span>
        </div>

        {/* Info rápida */}
        <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-tinta/60">
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
    </header>
  );
}

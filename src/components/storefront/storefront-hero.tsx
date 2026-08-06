'use client';

import { Banknote, CalendarDays, ChevronDown, Clock, Package, Store } from 'lucide-react';
import Image from 'next/image';
import { useState } from 'react';

import { StoreInfoSheet, type StoreInfoAddress } from '@/components/storefront/store-info-sheet';
import type { EffectiveStoreAvailability } from '@/features/stores/availability';
import { formatCurrency } from '@/lib/utils';
import type { StoreCustomizationConfig } from '@/schemas/customization';

interface OpeningHour {
  dayOfWeek: string;
  openTime: string;
  closeTime: string;
}

export interface StorefrontHeroProps {
  name: string;
  description: string | null;
  availability: EffectiveStoreAvailability;
  estimatedTime?: string;
  minOrderValue?: number;
  deliveryEnabled?: boolean;
  pickupEnabled?: boolean;
  minDeliveryFee?: number | null;
  openingHours?: OpeningHour[];
  acceptsPix?: boolean;
  acceptsCash?: boolean;
  acceptsCardOnDelivery?: boolean;
  phone?: string | null;
  whatsapp?: string | null;
  fullAddress?: StoreInfoAddress | null;
  showEstimatedTimeInHero?: boolean;
  showFulfillmentInHero?: boolean;
  showMinOrderValueInHero?: boolean;
  showOpeningHoursInHero?: boolean;
  logoUrl: string | null;
  logoAssetId?: string | null;
  coverUrl: string | null;
  coverAssetId?: string | null;
  config: StoreCustomizationConfig;
  shareUrl?: string;
}

const STATUS_CONFIG = {
  OPEN: { label: 'Aberta agora', classes: 'storefront-status-open' },
  CLOSED_BY_SCHEDULE: { label: 'Fechada agora', classes: 'storefront-status-closed' },
  MANUALLY_CLOSED: { label: 'Fechada', classes: 'storefront-status-closed' },
  PAUSED: { label: 'Pedidos pausados', classes: 'storefront-status-paused' },
  TENANT_SUSPENDED: { label: 'Temporariamente indisponível', classes: 'storefront-status-closed' },
  STORE_INACTIVE: { label: 'Temporariamente indisponível', classes: 'storefront-status-closed' },
  NOT_READY: { label: 'Temporariamente indisponível', classes: 'storefront-status-closed' },
} as const;

const DAY_LABELS: Record<string, string> = {
  MONDAY: 'Segunda-feira',
  TUESDAY: 'Terça-feira',
  WEDNESDAY: 'Quarta-feira',
  THURSDAY: 'Quinta-feira',
  FRIDAY: 'Sexta-feira',
  SATURDAY: 'Sábado',
  SUNDAY: 'Domingo',
};

function StoreLogo({
  name,
  logoUrl,
  logoAssetId,
}: Pick<StorefrontHeroProps, 'name' | 'logoUrl' | 'logoAssetId'>) {
  const src = logoAssetId ?? logoUrl;
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <span className="storefront-hero-logo storefront-hero-logo-fallback" aria-label={name}>
        <Store aria-hidden="true" />
      </span>
    );
  }

  return (
    <Image
      className="storefront-hero-logo"
      src={src}
      fill
      sizes="64px"
      alt={`Logo de ${name}`}
      priority
      onError={() => setFailed(true)}
    />
  );
}

export function StorefrontHero({
  name,
  description,
  availability,
  estimatedTime,
  minOrderValue = 0,
  deliveryEnabled = false,
  pickupEnabled = false,
  minDeliveryFee,
  openingHours = [],
  acceptsPix = false,
  acceptsCash = false,
  acceptsCardOnDelivery = false,
  phone = null,
  whatsapp = null,
  fullAddress = null,
  showEstimatedTimeInHero = true,
  showFulfillmentInHero = false,
  showMinOrderValueInHero = true,
  showOpeningHoursInHero = false,
  logoUrl,
  logoAssetId,
  coverUrl,
  coverAssetId,
  config,
  shareUrl,
}: StorefrontHeroProps) {
  const [failedCover, setFailedCover] = useState(false);
  const coverSrc = config.layout.showCover ? (coverAssetId ?? coverUrl) : null;
  const coverAvailable = Boolean(coverSrc && !failedCover);

  const statusInfo = STATUS_CONFIG[availability.state];
  const summary = config.identity.shortDescription || description;
  const deliveryLabel =
    minDeliveryFee && minDeliveryFee > 0
      ? `Entrega ${formatCurrency(minDeliveryFee)}`
      : 'Entrega disponível';
  const fulfillmentLabel =
    deliveryEnabled && pickupEnabled
      ? `${minDeliveryFee && minDeliveryFee > 0 ? formatCurrency(minDeliveryFee) : 'Entrega'} · Retirada`
      : deliveryEnabled
        ? deliveryLabel
        : pickupEnabled
          ? 'Retirada disponível'
          : null;
  const heroOperationalItems = [
    showEstimatedTimeInHero && estimatedTime,
    showFulfillmentInHero && fulfillmentLabel,
    showMinOrderValueInHero && minOrderValue > 0,
    showOpeningHoursInHero && openingHours.length > 0,
  ].filter(Boolean);
  const hasOperationalInfo = heroOperationalItems.length > 0;
  const compactHero = heroOperationalItems.length <= 2;

  return (
    <header
      className={`storefront-hero ${compactHero ? 'is-compact' : 'is-expanded'} ${coverAvailable ? 'has-cover' : 'has-cover-fallback'}`}
    >
      <div className="storefront-hero-media" aria-hidden="true">
        {coverAvailable && coverSrc ? (
          <Image
            className="storefront-hero-cover"
            src={coverSrc}
            fill
            sizes="100vw"
            alt=""
            priority
            onError={() => setFailedCover(true)}
          />
        ) : (
          <div className="storefront-hero-cover-fallback" />
        )}
        <div className="storefront-hero-overlay" />
      </div>

      <StoreInfoSheet
        name={name}
        description={description}
        slogan={config.identity.slogan}
        aboutText={config.identity.aboutText}
        logoUrl={logoUrl}
        logoAssetId={logoAssetId}
        availability={availability}
        estimatedTime={estimatedTime ?? null}
        minOrderValue={minOrderValue}
        deliveryEnabled={deliveryEnabled}
        pickupEnabled={pickupEnabled}
        minDeliveryFee={minDeliveryFee ?? null}
        openingHours={openingHours}
        address={fullAddress}
        acceptsPix={acceptsPix}
        acceptsCash={acceptsCash}
        acceptsCardOnDelivery={acceptsCardOnDelivery}
        phone={phone}
        whatsapp={whatsapp}
        shareUrl={shareUrl}
      />

      <div className="storefront-hero-content">
        <div className="storefront-hero-identity">
          <StoreLogo name={name} logoUrl={logoUrl} logoAssetId={logoAssetId} />
          <div className="min-w-0 flex-1">
            <h1 className="storefront-hero-title">{name}</h1>
            {config.layout.showSlogan && config.identity.slogan && (
              <p className="storefront-hero-slogan">{config.identity.slogan}</p>
            )}
          </div>
        </div>

        {summary && <p className="storefront-hero-description">{summary}</p>}

        <div className="storefront-hero-status-row">
          <span className={`storefront-status ${statusInfo.classes}`} title={availability.reason}>
            {statusInfo.label}
          </span>
          {!availability.acceptingOrders && (
            <p className="storefront-hero-unavailable" role="status">
              {availability.reason}
            </p>
          )}
        </div>

        {hasOperationalInfo && (
          <div className="storefront-operational-info" aria-label="Informações para pedir">
            {showEstimatedTimeInHero && estimatedTime && (
              <span
                className="storefront-operational-item"
                aria-label={`Preparo estimado: ${estimatedTime}`}
                title={`Preparo estimado: ${estimatedTime}`}
              >
                <Clock aria-hidden="true" />
                <span>{estimatedTime}</span>
              </span>
            )}
            {showFulfillmentInHero && fulfillmentLabel && (
              <span
                className="storefront-operational-item"
                aria-label={fulfillmentLabel}
                title={fulfillmentLabel}
              >
                <Package aria-hidden="true" />
                <span>{fulfillmentLabel}</span>
              </span>
            )}
            {showMinOrderValueInHero && minOrderValue > 0 && (
              <span
                className="storefront-operational-item"
                aria-label={`Pedido mínimo: ${formatCurrency(minOrderValue)}`}
                title={`Pedido mínimo: ${formatCurrency(minOrderValue)}`}
              >
                <Banknote aria-hidden="true" />
                <span>Mín. {formatCurrency(minOrderValue)}</span>
              </span>
            )}
            {showOpeningHoursInHero && openingHours.length > 0 && (
              <details className="storefront-hours">
                <summary aria-label="Ver horários">
                  <CalendarDays aria-hidden="true" />
                  <span>Horários</span>
                  <ChevronDown className="storefront-hours-chevron" aria-hidden="true" />
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
        )}
      </div>
    </header>
  );
}

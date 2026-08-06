'use client';

import * as Dialog from '@radix-ui/react-dialog';
import {
  Banknote,
  CalendarClock,
  Clock3,
  CreditCard,
  ExternalLink,
  MapPin,
  PackageCheck,
  Phone,
  ShoppingBag,
  Store,
  WalletCards,
  X,
} from 'lucide-react';
import Image from 'next/image';
import { useId, useState, useSyncExternalStore } from 'react';

import { StorefrontShareButton } from '@/components/storefront/storefront-share-button';
import type { EffectiveStoreAvailability } from '@/features/stores/availability';
import { formatPhone, formatZipCode, normalizePhone } from '@/lib/brazil';
import { formatCurrency } from '@/lib/utils';

interface OpeningHour {
  dayOfWeek: string;
  openTime: string;
  closeTime: string;
}

export interface StoreInfoAddress {
  street: string;
  number: string;
  complement: string | null;
  neighborhood: string;
  city: string;
  state: string;
  zipCode: string;
}

export interface StoreInfoSheetProps {
  name: string;
  description: string | null;
  slogan: string | null;
  aboutText: string | null;
  logoUrl: string | null;
  logoAssetId?: string | null;
  availability: EffectiveStoreAvailability;
  estimatedTime: string | null;
  minOrderValue: number | null;
  deliveryEnabled: boolean;
  pickupEnabled: boolean;
  minDeliveryFee: number | null;
  openingHours: OpeningHour[];
  address: StoreInfoAddress | null;
  acceptsPix: boolean;
  acceptsCash: boolean;
  acceptsCardOnDelivery: boolean;
  phone: string | null;
  whatsapp: string | null;
  shareUrl?: string;
}

const DAY_LABELS: Record<string, string> = {
  MONDAY: 'Segunda-feira',
  TUESDAY: 'Terça-feira',
  WEDNESDAY: 'Quarta-feira',
  THURSDAY: 'Quinta-feira',
  FRIDAY: 'Sexta-feira',
  SATURDAY: 'Sábado',
  SUNDAY: 'Domingo',
};

const JS_DAY_TO_KEY: Record<number, string> = {
  0: 'SUNDAY',
  1: 'MONDAY',
  2: 'TUESDAY',
  3: 'WEDNESDAY',
  4: 'THURSDAY',
  5: 'FRIDAY',
  6: 'SATURDAY',
};

function WhatsAppIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

function StoreInfoLogo({
  name,
  logoUrl,
  logoAssetId,
  isOpen,
}: Pick<StoreInfoSheetProps, 'name' | 'logoUrl' | 'logoAssetId'> & { isOpen: boolean }) {
  const src = logoAssetId ?? logoUrl;
  const [failed, setFailed] = useState(false);
  const imageAvailable = Boolean(src && !failed);

  return (
    <div className={`store-info-logo-wrapper ${isOpen ? 'is-open' : 'is-closed'}`}>
      {!imageAvailable || !src ? (
        <span className="store-info-logo store-info-logo-fallback" aria-label={name}>
          <Store aria-hidden="true" />
        </span>
      ) : (
        <Image
          className="store-info-logo"
          src={src}
          fill
          sizes="80px"
          alt={`Logo de ${name}`}
          onError={() => setFailed(true)}
        />
      )}
      <span className="store-info-status-badge" aria-hidden="true">
        <span className="store-info-status-dot" />
      </span>
    </div>
  );
}

function StoreInfoStat({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Store;
  label: string;
  value: string;
  tone?: 'success';
}) {
  return (
    <div className="store-info-stat">
      <span className="store-info-stat-icon">
        <Icon aria-hidden="true" />
      </span>
      <div>
        <p className={tone === 'success' ? 'store-info-success' : undefined}>{label}</p>
        <span>{value}</span>
      </div>
    </div>
  );
}

function ExpandableAbout({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const contentId = useId();
  const needsClamp = text.length > 140;

  return (
    <div className="store-info-about-wrapper">
      <p
        id={contentId}
        className={`store-info-about ${needsClamp && !expanded ? 'is-clamped' : ''}`}
      >
        {text}
      </p>
      {needsClamp && (
        <button
          type="button"
          className="store-info-read-more"
          onClick={() => setExpanded((current) => !current)}
          aria-expanded={expanded}
          aria-controls={contentId}
        >
          {expanded ? 'Ler menos' : 'Ler mais'}
        </button>
      )}
    </div>
  );
}

function buildAddressLines(address: StoreInfoAddress) {
  return [
    `${address.street}, ${address.number}`,
    address.complement?.trim() || null,
    `${address.neighborhood}, ${address.city} - ${address.state}`,
    `CEP ${formatZipCode(address.zipCode)}`,
  ].filter((line): line is string => Boolean(line));
}

function availabilityDetail(availability: EffectiveStoreAvailability) {
  const detail = availability.reason.replace(/^[^.]+[.]\s*/, '').trim();
  return detail || availability.reason;
}

function getTodayKey() {
  return JS_DAY_TO_KEY[new Date().getDay()] ?? '';
}

function subscribeToLocalDay() {
  return () => {};
}

export function StoreInfoSheet(props: StoreInfoSheetProps) {
  const [open, setOpen] = useState(false);
  const identityDescription = props.aboutText || props.description;
  const addressLines = props.address ? buildAddressLines(props.address) : [];
  const mapHref =
    addressLines.length > 0
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressLines.join(', '))}`
      : null;
  const normalizedPhone = props.phone ? normalizePhone(props.phone) : '';
  const normalizedWhatsapp = props.whatsapp ? normalizePhone(props.whatsapp) : '';
  const payments = [
    props.acceptsPix ? { label: 'Pix', icon: WalletCards, tone: 'pix', color: '#168f83' } : null,
    props.acceptsCash
      ? { label: 'Dinheiro', icon: Banknote, tone: 'cash', color: '#3f7d58' }
      : null,
    props.acceptsCardOnDelivery
      ? { label: 'Cartão no recebimento', icon: CreditCard, tone: 'card', color: '#c77a00' }
      : null,
  ].filter((payment): payment is NonNullable<typeof payment> => payment !== null);
  const todayKey = useSyncExternalStore(subscribeToLocalDay, getTodayKey, () => '');
  const isOpen = props.availability.acceptingOrders;

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button type="button" className="store-info-trigger">
          <Store aria-hidden="true" />
          <span>Sobre a loja</span>
        </button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="store-info-overlay" onClick={() => setOpen(false)} />
        <Dialog.Content className="store-info-dialog">
          <div className="store-info-drag-handle" aria-hidden="true" />
          <header className="store-info-header">
            <div className="store-info-heading">
              <Store aria-hidden="true" />
              <Dialog.Title>Sobre a loja</Dialog.Title>
            </div>
            <Dialog.Description className="sr-only">
              Informações públicas, funcionamento e contatos de {props.name}.
            </Dialog.Description>
            <div className="store-info-header-actions">
              <StorefrontShareButton
                storeName={props.name}
                shareUrl={props.shareUrl}
                className="store-info-share-btn"
              />
              <Dialog.Close asChild>
                <button type="button" className="store-info-close" aria-label="Fechar Sobre a loja">
                  <X aria-hidden="true" />
                </button>
              </Dialog.Close>
            </div>
          </header>

          <div className="store-info-scroll">
            <section
              className="store-info-identity store-info-section-animate"
              aria-label="Identidade da loja"
              style={{ '--section-index': 0 } as React.CSSProperties}
            >
              <StoreInfoLogo
                name={props.name}
                logoUrl={props.logoUrl}
                logoAssetId={props.logoAssetId}
                isOpen={isOpen}
              />
              <div>
                <h2 className="store-info-name">{props.name}</h2>
                {props.slogan ? <p className="store-info-slogan">{props.slogan}</p> : null}
                {identityDescription ? <ExpandableAbout text={identityDescription} /> : null}
              </div>
            </section>

            <section
              className="store-info-summary store-info-section-animate"
              aria-label="Resumo operacional"
              style={{ '--section-index': 1 } as React.CSSProperties}
            >
              <StoreInfoStat
                icon={Store}
                label={isOpen ? 'Aberta agora' : 'Fechada agora'}
                value={availabilityDetail(props.availability)}
                tone={isOpen ? 'success' : undefined}
              />
              {props.estimatedTime ? (
                <StoreInfoStat icon={Clock3} label={props.estimatedTime} value="Tempo de preparo" />
              ) : null}
              {props.minOrderValue !== null ? (
                <StoreInfoStat
                  icon={ShoppingBag}
                  label={formatCurrency(props.minOrderValue)}
                  value="Pedido mínimo"
                />
              ) : null}
            </section>

            {(props.deliveryEnabled || props.pickupEnabled) && (
              <section
                className="store-info-fulfillment store-info-section-animate"
                aria-label="Modalidades de atendimento"
                style={{ '--section-index': 2 } as React.CSSProperties}
              >
                {props.deliveryEnabled ? (
                  <StoreInfoStat
                    icon={PackageCheck}
                    label="Entrega"
                    value={
                      props.minDeliveryFee && props.minDeliveryFee > 0
                        ? `Taxa a partir de ${formatCurrency(props.minDeliveryFee)}`
                        : 'Disponível'
                    }
                  />
                ) : null}
                {props.pickupEnabled ? (
                  <StoreInfoStat icon={ShoppingBag} label="Retirada no local" value="Disponível" />
                ) : null}
              </section>
            )}

            {(props.openingHours.length > 0 || props.address) && (
              <div className="store-info-details">
                {props.openingHours.length > 0 ? (
                  <section
                    className="store-info-section store-info-section-animate"
                    aria-labelledby="store-hours-title"
                    style={{ '--section-index': 3 } as React.CSSProperties}
                  >
                    <h3 id="store-hours-title">
                      <CalendarClock aria-hidden="true" />
                      Horário de funcionamento
                    </h3>
                    <dl className="store-info-hours">
                      {props.openingHours.map((hour) => {
                        const isToday = hour.dayOfWeek === todayKey;
                        return (
                          <div key={hour.dayOfWeek} className={isToday ? 'is-today' : undefined}>
                            <dt>
                              {DAY_LABELS[hour.dayOfWeek] ?? hour.dayOfWeek}
                              {isToday && <span className="store-info-today-badge">Hoje</span>}
                            </dt>
                            <dd>
                              {hour.openTime}–{hour.closeTime}
                            </dd>
                          </div>
                        );
                      })}
                    </dl>
                  </section>
                ) : null}

                {props.address ? (
                  <section
                    className="store-info-section store-info-section-animate"
                    aria-labelledby="store-address-title"
                    style={{ '--section-index': 4 } as React.CSSProperties}
                  >
                    <h3 id="store-address-title">
                      <MapPin aria-hidden="true" />
                      Endereço
                    </h3>
                    {mapHref ? (
                      <a
                        className="store-info-address-card"
                        href={mapHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Abrir endereço no mapa: ${addressLines.join(', ')}`}
                      >
                        <address>
                          {addressLines.map((line) => (
                            <span key={line}>{line}</span>
                          ))}
                        </address>
                        <span className="store-info-address-action">
                          <MapPin aria-hidden="true" />
                          Abrir no mapa
                          <ExternalLink className="store-info-external-icon" aria-hidden="true" />
                        </span>
                      </a>
                    ) : (
                      <address>
                        {addressLines.map((line) => (
                          <span key={line}>{line}</span>
                        ))}
                      </address>
                    )}
                  </section>
                ) : null}
              </div>
            )}

            {payments.length > 0 ? (
              <section
                className="store-info-section store-info-payments store-info-section-animate"
                aria-labelledby="payments-title"
                style={{ '--section-index': 5 } as React.CSSProperties}
              >
                <h3 id="payments-title">
                  <CreditCard aria-hidden="true" />
                  Formas de pagamento
                </h3>
                <div className="store-info-payment-grid">
                  {payments.map((payment) => {
                    const Icon = payment.icon;
                    return (
                      <span key={payment.label} data-tone={payment.tone}>
                        <Icon
                          className={`store-info-payment-icon-${payment.tone}`}
                          color={payment.color}
                          aria-hidden="true"
                        />
                        {payment.label}
                      </span>
                    );
                  })}
                </div>
              </section>
            ) : null}

            {(normalizedPhone || normalizedWhatsapp) && (
              <section
                className="store-info-section store-info-contact store-info-section-animate"
                aria-labelledby="contact-title"
                style={{ '--section-index': 6 } as React.CSSProperties}
              >
                <h3 id="contact-title">
                  <Phone aria-hidden="true" />
                  Fale conosco
                </h3>
                <div className="store-info-contact-actions">
                  {normalizedPhone ? (
                    <a
                      className="store-info-phone-btn"
                      href={`tel:+${normalizedPhone}`}
                      aria-label={`Ligar para ${formatPhone(props.phone ?? '')}`}
                    >
                      <Phone aria-hidden="true" />
                      Ligar
                    </a>
                  ) : null}
                  {normalizedWhatsapp ? (
                    <a
                      className="store-info-whatsapp"
                      href={`https://wa.me/${normalizedWhatsapp}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <WhatsAppIcon />
                      WhatsApp
                    </a>
                  ) : null}
                </div>
              </section>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

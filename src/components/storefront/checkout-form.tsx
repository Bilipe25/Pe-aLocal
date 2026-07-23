'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { OrderSummary } from './order-summary';
import { useCartStore } from '@/stores/cart-store';
import { createOrderAction, getCheckoutAvailabilityAction } from '@/features/orders/actions';
import {
  clearCheckoutIdempotency,
  resolveCheckoutIdempotency,
  type CheckoutIdempotencyRecord,
} from '@/lib/orders/checkout-idempotency';
import {
  clearCheckoutDraft,
  readCheckoutDraft,
  writeCheckoutDraft,
  type CheckoutDraftModality,
  type CheckoutDraftPaymentMethod,
} from '@/lib/checkout/checkout-draft';
import { formatPhoneInput } from '@/lib/brazil';
import { formatCurrency } from '@/lib/utils';
import type { PublicDeliveryZoneDto } from '@/types/storefront';

interface CheckoutFormProps {
  storeId: string;
  storeSlug: string;
  minOrderValue: number;
  deliveryEnabled: boolean;
  pickupEnabled: boolean;
  acceptsPix: boolean;
  acceptsCash: boolean;
  acceptsCardOnDelivery: boolean;
  deliveryZones: PublicDeliveryZoneDto[];
}

interface AvailabilityIssue {
  state: string;
  reason: string;
}

function getCheckoutSessionStorage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function CheckoutForm({
  storeId,
  storeSlug,
  minOrderValue,
  deliveryEnabled,
  pickupEnabled,
  acceptsPix,
  acceptsCash,
  acceptsCardOnDelivery,
  deliveryZones,
}: CheckoutFormProps) {
  const router = useRouter();
  const items = useCartStore((s) => s.items);
  const activeStoreId = useCartStore((s) => s.storeId);
  const setStore = useCartStore((s) => s.setStore);
  const clearCart = useCartStore((s) => s.clearCart);
  const [isPending, startTransition] = useTransition();
  const canDeliver = deliveryEnabled && deliveryZones.length > 0;
  const hasFulfillmentMethod = canDeliver || pickupEnabled;
  const hasPaymentMethod = acceptsPix || acceptsCash || acceptsCardOnDelivery;

  // Form state
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [modality, setModality] = useState<CheckoutDraftModality>(
    canDeliver ? 'DELIVERY' : 'PICKUP',
  );
  const [deliveryZoneId, setDeliveryZoneId] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<CheckoutDraftPaymentMethod>(
    acceptsPix ? 'PIX' : acceptsCash ? 'CASH' : 'CARD_ON_DELIVERY',
  );
  const [changeFor, setChangeFor] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [availabilityIssue, setAvailabilityIssue] = useState<AvailabilityIssue | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const availabilityRef = useRef<HTMLDivElement>(null);
  const idempotencyRef = useRef<CheckoutIdempotencyRecord | null>(null);
  const restoredDraftStoreIdRef = useRef<string | null>(null);
  const draftWriteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const checkoutCompletedRef = useRef(false);
  const [draftReadyStoreId, setDraftReadyStoreId] = useState<string | null>(null);

  useEffect(() => setStore(storeId, storeSlug), [setStore, storeId, storeSlug]);

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  useEffect(() => {
    if (availabilityIssue) availabilityRef.current?.focus();
  }, [availabilityIssue]);

  useEffect(() => {
    if (restoredDraftStoreIdRef.current === storeId) return;
    const restoreTimer = setTimeout(() => {
      if (restoredDraftStoreIdRef.current === storeId) return;
      restoredDraftStoreIdRef.current = storeId;

      const draft = readCheckoutDraft(getCheckoutSessionStorage(), storeId);
      if (!draft) {
        setDraftReadyStoreId(storeId);
        return;
      }

      setCustomerName(draft.customerName);
      setCustomerPhone(formatPhoneInput(draft.customerPhone));

      const restoredModality =
        draft.modality === 'DELIVERY' && canDeliver
          ? 'DELIVERY'
          : draft.modality === 'PICKUP' && pickupEnabled
            ? 'PICKUP'
            : canDeliver
              ? 'DELIVERY'
              : 'PICKUP';
      setModality(restoredModality);

      const zoneStillAvailable = deliveryZones.some((zone) => zone.id === draft.deliveryZoneId);
      setDeliveryZoneId(zoneStillAvailable ? draft.deliveryZoneId : '');
      setDeliveryAddress(zoneStillAvailable ? draft.deliveryAddress : '');

      const paymentStillAvailable =
        (draft.paymentMethod === 'PIX' && acceptsPix) ||
        (draft.paymentMethod === 'CASH' && acceptsCash) ||
        (draft.paymentMethod === 'CARD_ON_DELIVERY' && acceptsCardOnDelivery);
      setPaymentMethod(
        paymentStillAvailable
          ? draft.paymentMethod
          : acceptsPix
            ? 'PIX'
            : acceptsCash
              ? 'CASH'
              : 'CARD_ON_DELIVERY',
      );
      setDraftReadyStoreId(storeId);
    }, 0);

    return () => clearTimeout(restoreTimer);
  }, [
    acceptsCardOnDelivery,
    acceptsCash,
    acceptsPix,
    canDeliver,
    deliveryZones,
    pickupEnabled,
    storeId,
  ]);

  useEffect(() => {
    if (draftReadyStoreId !== storeId || checkoutCompletedRef.current) return;
    draftWriteTimerRef.current = setTimeout(() => {
      writeCheckoutDraft(getCheckoutSessionStorage(), storeId, {
        customerName,
        customerPhone,
        modality,
        deliveryZoneId,
        deliveryAddress,
        paymentMethod,
      });
    }, 250);

    return () => {
      if (draftWriteTimerRef.current) clearTimeout(draftWriteTimerRef.current);
      draftWriteTimerRef.current = null;
    };
  }, [
    customerName,
    customerPhone,
    deliveryAddress,
    deliveryZoneId,
    draftReadyStoreId,
    modality,
    paymentMethod,
    storeId,
  ]);

  if (activeStoreId !== storeId) {
    return (
      <p className="text-text-muted py-8 text-center text-sm" role="status" aria-live="polite">
        Carregando sua sacola…
      </p>
    );
  }

  // Calculations
  const subtotal = items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
  const selectedZone = deliveryZones.find((z) => z.id === deliveryZoneId);
  const deliveryFee = modality === 'DELIVERY' && selectedZone ? selectedZone.fee : 0;
  const total = subtotal + deliveryFee;
  const effectiveMinOrderValue = Math.max(
    minOrderValue,
    modality === 'DELIVERY' ? (selectedZone?.minOrderValue ?? 0) : 0,
  );
  const missingForMinimum = Math.max(0, effectiveMinOrderValue - subtotal);

  function setAvailabilityFromAction(data: AvailabilityIssue) {
    setError(null);
    setAvailabilityIssue(data);
  }

  async function retryAvailability() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await getCheckoutAvailabilityAction(storeSlug);
        if (!result.success) {
          setError(result.error.message);
          return;
        }
        if (!result.data.acceptingOrders) {
          setAvailabilityFromAction(result.data);
          return;
        }
        setAvailabilityIssue(null);
      } catch {
        setError('Não foi possível verificar a loja agora. Tente novamente.');
      }
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setAvailabilityIssue(null);

    if (useCartStore.getState().storeId !== storeId) {
      setError('Não foi possível carregar a sacola desta loja. Tente novamente.');
      return;
    }

    if (items.length === 0) {
      setError('Seu carrinho está vazio');
      return;
    }

    startTransition(async () => {
      try {
        const availability = await getCheckoutAvailabilityAction(storeSlug);
        if (!availability.success) {
          setError(availability.error.message);
          return;
        }
        if (!availability.data.acceptingOrders) {
          setAvailabilityFromAction(availability.data);
          return;
        }

        const checkoutPayload = {
          customerName,
          customerPhone,
          modality,
          deliveryZoneId: modality === 'DELIVERY' ? deliveryZoneId : undefined,
          deliveryAddress: modality === 'DELIVERY' ? deliveryAddress : undefined,
          paymentMethod,
          changeFor:
            paymentMethod === 'CASH' && changeFor
              ? Math.round(parseFloat(changeFor) * 100)
              : undefined,
          notes: notes || undefined,
          items: items.map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
            notes: i.notes || undefined,
            optionIds: i.selectedOptions.map((o) => o.id),
          })),
        };
        const storage = getCheckoutSessionStorage();
        const storageKey = `checkout-idempotency:${storeSlug}`;
        idempotencyRef.current = await resolveCheckoutIdempotency(
          checkoutPayload,
          storage,
          storageKey,
          idempotencyRef.current,
        );
        const result = await createOrderAction(storeSlug, {
          ...checkoutPayload,
          idempotencyKey: idempotencyRef.current.key,
        });

        if (!result.success) {
          const availabilityDetails = result.error.details?.find(
            (details) => typeof details.state === 'string',
          );
          if (availabilityDetails && typeof availabilityDetails.state === 'string') {
            setAvailabilityFromAction({
              state: availabilityDetails.state,
              reason: result.error.message,
            });
          } else {
            setError(result.error.message);
          }
          return;
        }

        idempotencyRef.current = null;
        checkoutCompletedRef.current = true;
        if (draftWriteTimerRef.current) clearTimeout(draftWriteTimerRef.current);
        draftWriteTimerRef.current = null;
        clearCheckoutIdempotency(storage, storageKey);
        clearCheckoutDraft(storage, storeId);
        if (result.data.paymentReportToken) {
          try {
            storage?.setItem(
              `payment-report:${result.data.publicToken}`,
              result.data.paymentReportToken,
            );
          } catch {
            // O acompanhamento continua disponível; apenas o relato pelo navegador é desativado.
          }
        }
        clearCart();
        router.push(`/${storeSlug}/order/${result.data.publicToken}`);
      } catch {
        setError('Não foi possível enviar seu pedido agora. Seus dados foram preservados.');
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <fieldset disabled={isPending} className="space-y-6 border-0 p-0">
        <legend className="sr-only">Dados do pedido</legend>
        {/* Dados pessoais */}
        <section>
          <h2 className="font-display text-tinta text-base font-bold">Seus dados</h2>
          <div className="mt-2 space-y-3">
            <div>
              <label htmlFor="name" className="text-text-muted text-sm font-medium">
                Nome
              </label>
              <Input
                id="name"
                type="text"
                autoComplete="name"
                required
                minLength={2}
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Seu nome"
                className="border-tinta/15 bg-papel text-tinta placeholder:text-text-muted focus-visible:ring-pimenta mt-1 min-h-11"
              />
            </div>
            <div>
              <label htmlFor="phone" className="text-text-muted text-sm font-medium">
                Telefone / WhatsApp
              </label>
              <Input
                id="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                required
                maxLength={15}
                value={customerPhone}
                onChange={(e) => setCustomerPhone(formatPhoneInput(e.target.value))}
                placeholder="(11) 99999-9999"
                className="border-tinta/15 bg-papel text-tinta placeholder:text-text-muted focus-visible:ring-pimenta mt-1 min-h-11"
              />
            </div>
          </div>
        </section>

        {/* Modalidade */}
        <section>
          <h2 className="font-display text-tinta text-base font-bold">Como quer receber?</h2>
          <div className="mt-2 flex gap-2">
            {canDeliver && (
              <button
                type="button"
                onClick={() => setModality('DELIVERY')}
                aria-pressed={modality === 'DELIVERY'}
                className={`min-h-11 flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
                  modality === 'DELIVERY'
                    ? 'storefront-selection-control storefront-selection-row text-tinta'
                    : 'border-tinta/15 text-text-muted hover:border-tinta/30'
                }`}
              >
                🛵 Entrega
              </button>
            )}
            {pickupEnabled && (
              <button
                type="button"
                onClick={() => setModality('PICKUP')}
                aria-pressed={modality === 'PICKUP'}
                className={`min-h-11 flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
                  modality === 'PICKUP'
                    ? 'storefront-selection-control storefront-selection-row text-tinta'
                    : 'border-tinta/15 text-text-muted hover:border-tinta/30'
                }`}
              >
                🏪 Retirada
              </button>
            )}
          </div>

          {deliveryEnabled && !canDeliver && (
            <p className="text-text-muted mt-2 text-sm">
              A entrega está temporariamente indisponível porque não há regiões ativas.
            </p>
          )}
          {!hasFulfillmentMethod && (
            <p className="border-error/20 bg-error-light text-tinta mt-2 rounded-lg border px-3 py-2 text-sm">
              A loja não possui entrega ou retirada disponível agora.
            </p>
          )}

          {modality === 'DELIVERY' && (
            <div className="mt-3 space-y-3">
              <div>
                <label htmlFor="zone" className="text-text-muted text-sm font-medium">
                  Zona de entrega
                </label>
                <select
                  id="zone"
                  required
                  value={deliveryZoneId}
                  onChange={(e) => setDeliveryZoneId(e.target.value)}
                  aria-describedby={deliveryZoneId ? 'selected-zone-details' : undefined}
                  className="border-tinta/15 bg-papel text-tinta focus-visible:ring-pimenta mt-1 min-h-11 w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
                >
                  <option value="">Selecione sua região</option>
                  {deliveryZones.map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.name} — {formatCurrency(z.fee)}
                      {z.estimatedTime ? ` (${z.estimatedTime})` : ''}
                    </option>
                  ))}
                </select>
                <div id="selected-zone-details" role="status" aria-live="polite" className="mt-2">
                  {selectedZone ? (
                    <div className="bg-kraft/40 text-tinta space-y-1 rounded-lg px-3 py-2 text-sm">
                      <p>
                        <span className="font-medium">Taxa de entrega:</span>{' '}
                        {formatCurrency(selectedZone.fee)}
                      </p>
                      <p>
                        <span className="font-medium">Prazo estimado:</span>{' '}
                        {selectedZone.estimatedTime || 'a confirmar pela loja'}
                      </p>
                      <p>
                        <span className="font-medium">Pedido mínimo:</span>{' '}
                        {formatCurrency(Math.max(minOrderValue, selectedZone.minOrderValue ?? 0))}
                      </p>
                    </div>
                  ) : deliveryZoneId ? (
                    <p className="bg-error-light text-error rounded-lg px-3 py-2 text-sm">
                      Esta região não está mais disponível. Selecione outra opção.
                    </p>
                  ) : null}
                </div>
              </div>
              <div>
                <label htmlFor="address" className="text-text-muted text-sm font-medium">
                  Endereço de entrega
                </label>
                <Textarea
                  id="address"
                  autoComplete="street-address"
                  required
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  placeholder="Rua, número, complemento, bairro"
                  rows={2}
                  className="border-tinta/15 bg-papel text-tinta placeholder:text-text-muted focus-visible:ring-pimenta mt-1 min-h-11"
                />
              </div>
            </div>
          )}
        </section>

        {/* Pagamento */}
        <section>
          <h2 className="font-display text-tinta text-base font-bold">Pagamento</h2>
          <div className="mt-2 space-y-1.5">
            {acceptsPix && (
              <label
                className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-4 py-2.5 text-sm transition-colors ${
                  paymentMethod === 'PIX'
                    ? 'storefront-selection-control storefront-selection-row text-tinta'
                    : 'border-tinta/15 text-text-muted hover:border-tinta/30'
                }`}
              >
                <input
                  type="radio"
                  name="payment"
                  checked={paymentMethod === 'PIX'}
                  onChange={() => setPaymentMethod('PIX')}
                  className="sr-only"
                />
                <span>💳 Pix</span>
              </label>
            )}
            {acceptsCash && (
              <label
                className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-4 py-2.5 text-sm transition-colors ${
                  paymentMethod === 'CASH'
                    ? 'storefront-selection-control storefront-selection-row text-tinta'
                    : 'border-tinta/15 text-text-muted hover:border-tinta/30'
                }`}
              >
                <input
                  type="radio"
                  name="payment"
                  checked={paymentMethod === 'CASH'}
                  onChange={() => setPaymentMethod('CASH')}
                  className="sr-only"
                />
                <span>💵 Dinheiro</span>
              </label>
            )}
            {acceptsCardOnDelivery && (
              <label
                className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-4 py-2.5 text-sm transition-colors ${
                  paymentMethod === 'CARD_ON_DELIVERY'
                    ? 'storefront-selection-control storefront-selection-row text-tinta'
                    : 'border-tinta/15 text-text-muted hover:border-tinta/30'
                }`}
              >
                <input
                  type="radio"
                  name="payment"
                  checked={paymentMethod === 'CARD_ON_DELIVERY'}
                  onChange={() => setPaymentMethod('CARD_ON_DELIVERY')}
                  className="sr-only"
                />
                <span>💳 Cartão na entrega</span>
              </label>
            )}
          </div>

          {!hasPaymentMethod && (
            <p className="border-error/20 bg-error-light text-tinta mt-2 rounded-lg border px-3 py-2 text-sm">
              A loja não possui uma forma de pagamento disponível agora.
            </p>
          )}

          {paymentMethod === 'CASH' && (
            <div className="mt-3">
              <label htmlFor="change" className="text-text-muted text-sm font-medium">
                Troco para (opcional)
              </label>
              <Input
                id="change"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={changeFor}
                onChange={(e) => setChangeFor(e.target.value)}
                placeholder="Ex: 50.00"
                className="border-tinta/15 bg-papel text-tinta placeholder:text-text-muted focus-visible:ring-pimenta mt-1 min-h-11"
              />
            </div>
          )}
        </section>

        {/* Observações */}
        <section>
          <h2 className="font-display text-tinta text-base font-bold">Observações</h2>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Alguma observação para o estabelecimento?"
            rows={2}
            className="border-tinta/15 bg-papel text-tinta placeholder:text-text-muted focus-visible:ring-pimenta mt-2 min-h-11"
          />
        </section>
      </fieldset>

      {/* Resumo */}
      <OrderSummary items={items} subtotal={subtotal} deliveryFee={deliveryFee} total={total} />

      {missingForMinimum > 0 && (
        <div
          id="minimum-order-message"
          role="status"
          className="border-warning/30 bg-warning-light text-tinta rounded-lg border px-4 py-3 text-sm"
        >
          Adicione mais {formatCurrency(missingForMinimum)} para atingir o pedido mínimo de{' '}
          {formatCurrency(effectiveMinOrderValue)}.
        </div>
      )}

      {/* Erro */}
      {error && (
        <div
          id="checkout-error"
          ref={errorRef}
          role="alert"
          aria-live="assertive"
          tabIndex={-1}
          className="border-error/20 bg-error-light text-tinta rounded-lg border px-4 py-2 text-sm outline-none"
        >
          {error}
        </div>
      )}

      {availabilityIssue && (
        <div
          id="checkout-availability-error"
          ref={availabilityRef}
          role="alert"
          aria-live="assertive"
          tabIndex={-1}
          className="border-warning/30 bg-warning-light text-tinta rounded-lg border px-4 py-3 outline-none"
        >
          <p className="font-semibold">A loja não está aceitando pedidos agora.</p>
          <p className="mt-1 text-sm">{availabilityIssue.reason}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href={`/${storeSlug}`}
              className="storefront-link inline-flex min-h-11 items-center px-2 text-sm font-medium"
            >
              Voltar ao cardápio
            </Link>
            <Button
              type="button"
              variant="outline"
              onClick={retryAvailability}
              disabled={isPending}
            >
              Verificar novamente
            </Button>
          </div>
        </div>
      )}

      {/* Submit */}
      <Button
        type="submit"
        disabled={
          isPending ||
          items.length === 0 ||
          missingForMinimum > 0 ||
          !hasFulfillmentMethod ||
          !hasPaymentMethod
        }
        aria-describedby={
          availabilityIssue
            ? 'checkout-availability-error'
            : error
              ? 'checkout-error'
              : missingForMinimum > 0
                ? 'minimum-order-message'
                : undefined
        }
        className="storefront-primary-action font-body w-full font-medium shadow-sm disabled:opacity-50"
      >
        {isPending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Processando...
          </>
        ) : (
          `Confirmar pedido · ${formatCurrency(total)}`
        )}
      </Button>
    </form>
  );
}

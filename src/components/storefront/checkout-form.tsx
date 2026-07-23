'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { OrderSummary } from './order-summary';
import { useCartStore } from '@/stores/cart-store';
import { createOrderAction } from '@/features/orders/actions';
import {
  clearCheckoutIdempotency,
  resolveCheckoutIdempotency,
  type CheckoutIdempotencyRecord,
} from '@/lib/orders/checkout-idempotency';
import { formatCurrency } from '@/lib/utils';

interface DeliveryZone {
  id: string;
  name: string;
  fee: number;
  estimatedTime: string | null;
  minOrderValue: number | null;
}

interface CheckoutFormProps {
  storeSlug: string;
  minOrderValue: number;
  deliveryEnabled: boolean;
  pickupEnabled: boolean;
  acceptsPix: boolean;
  acceptsCash: boolean;
  acceptsCardOnDelivery: boolean;
  deliveryZones: DeliveryZone[];
}

export function CheckoutForm({
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
  const clearCart = useCartStore((s) => s.clearCart);
  const [isPending, startTransition] = useTransition();
  const canDeliver = deliveryEnabled && deliveryZones.length > 0;
  const hasFulfillmentMethod = canDeliver || pickupEnabled;
  const hasPaymentMethod = acceptsPix || acceptsCash || acceptsCardOnDelivery;

  // Form state
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [modality, setModality] = useState<'DELIVERY' | 'PICKUP'>(
    canDeliver ? 'DELIVERY' : 'PICKUP',
  );
  const [deliveryZoneId, setDeliveryZoneId] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'PIX' | 'CASH' | 'CARD_ON_DELIVERY'>(
    acceptsPix ? 'PIX' : acceptsCash ? 'CASH' : 'CARD_ON_DELIVERY',
  );
  const [changeFor, setChangeFor] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const idempotencyRef = useRef<CheckoutIdempotencyRecord | null>(null);

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (items.length === 0) {
      setError('Seu carrinho está vazio');
      return;
    }

    startTransition(async () => {
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
      let storage: Storage | null = null;
      try {
        storage = window.sessionStorage;
      } catch {
        // Restricted browsing contexts still retain the in-memory key.
      }
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
        setError(result.error.message);
        return;
      }

      idempotencyRef.current = null;
      clearCheckoutIdempotency(storage, storageKey);
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
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
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
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
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
          error ? 'checkout-error' : missingForMinimum > 0 ? 'minimum-order-message' : undefined
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

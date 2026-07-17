'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { OrderSummary } from './order-summary';
import { useCartStore } from '@/stores/cart-store';
import { createOrderAction } from '@/features/orders/actions';
import { formatCurrency } from '@/lib/utils';

interface DeliveryZone {
  id: string;
  name: string;
  fee: number;
  estimatedTime: string | null;
}

interface CheckoutFormProps {
  storeSlug: string;
  deliveryEnabled: boolean;
  pickupEnabled: boolean;
  acceptsPix: boolean;
  acceptsCash: boolean;
  acceptsCardOnDelivery: boolean;
  deliveryZones: DeliveryZone[];
}

export function CheckoutForm({
  storeSlug,
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

  // Form state
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [modality, setModality] = useState<'DELIVERY' | 'PICKUP'>(
    deliveryEnabled ? 'DELIVERY' : 'PICKUP',
  );
  const [deliveryZoneId, setDeliveryZoneId] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'PIX' | 'CASH' | 'CARD_ON_DELIVERY'>(
    acceptsPix ? 'PIX' : acceptsCash ? 'CASH' : 'CARD_ON_DELIVERY',
  );
  const [changeFor, setChangeFor] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Calculations
  const subtotal = items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
  const selectedZone = deliveryZones.find((z) => z.id === deliveryZoneId);
  const deliveryFee = modality === 'DELIVERY' && selectedZone ? selectedZone.fee : 0;
  const total = subtotal + deliveryFee;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (items.length === 0) {
      setError('Seu carrinho está vazio');
      return;
    }

    startTransition(async () => {
      const result = await createOrderAction(storeSlug, {
        customerName,
        customerPhone,
        modality,
        deliveryZoneId: modality === 'DELIVERY' ? deliveryZoneId : undefined,
        deliveryAddress: modality === 'DELIVERY' ? deliveryAddress : undefined,
        paymentMethod,
        changeFor: paymentMethod === 'CASH' && changeFor ? Math.round(parseFloat(changeFor) * 100) : undefined,
        notes: notes || undefined,
        idempotencyKey: crypto.randomUUID(),
        items: items.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
          notes: i.notes || undefined,
          optionIds: i.selectedOptions.map((o) => o.id),
        })),
      });

      if (!result.success) {
        setError(result.error.message);
        return;
      }

      clearCart();
      router.push(`/${storeSlug}/order/${result.data.publicToken}`);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Dados pessoais */}
      <section>
        <h2 className="font-display text-base font-bold text-tinta">Seus dados</h2>
        <div className="mt-2 space-y-3">
          <div>
            <label htmlFor="name" className="text-sm font-medium text-tinta/70">
              Nome
            </label>
            <Input
              id="name"
              type="text"
              required
              minLength={2}
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Seu nome"
              className="mt-1 bg-papel border-tinta/15 text-tinta placeholder:text-tinta/40 focus-visible:ring-pimenta"
            />
          </div>
          <div>
            <label htmlFor="phone" className="text-sm font-medium text-tinta/70">
              Telefone / WhatsApp
            </label>
            <Input
              id="phone"
              type="tel"
              required
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              placeholder="(11) 99999-9999"
              className="mt-1 bg-papel border-tinta/15 text-tinta placeholder:text-tinta/40 focus-visible:ring-pimenta"
            />
          </div>
        </div>
      </section>

      {/* Modalidade */}
      <section>
        <h2 className="font-display text-base font-bold text-tinta">Como quer receber?</h2>
        <div className="mt-2 flex gap-2">
          {deliveryEnabled && (
            <button
              type="button"
              onClick={() => setModality('DELIVERY')}
              className={`flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
                modality === 'DELIVERY'
                  ? 'border-pimenta bg-pimenta/10 text-pimenta'
                  : 'border-tinta/15 text-tinta/60 hover:border-tinta/30'
              }`}
            >
              🛵 Entrega
            </button>
          )}
          {pickupEnabled && (
            <button
              type="button"
              onClick={() => setModality('PICKUP')}
              className={`flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
                modality === 'PICKUP'
                  ? 'border-pimenta bg-pimenta/10 text-pimenta'
                  : 'border-tinta/15 text-tinta/60 hover:border-tinta/30'
              }`}
            >
              🏪 Retirada
            </button>
          )}
        </div>

        {modality === 'DELIVERY' && (
          <div className="mt-3 space-y-3">
            <div>
              <label htmlFor="zone" className="text-sm font-medium text-tinta/70">
                Zona de entrega
              </label>
              <select
                id="zone"
                required
                value={deliveryZoneId}
                onChange={(e) => setDeliveryZoneId(e.target.value)}
                className="mt-1 w-full rounded-md border border-tinta/15 bg-papel px-3 py-2 text-sm text-tinta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pimenta"
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
              <label htmlFor="address" className="text-sm font-medium text-tinta/70">
                Endereço de entrega
              </label>
              <Textarea
                id="address"
                required
                value={deliveryAddress}
                onChange={(e) => setDeliveryAddress(e.target.value)}
                placeholder="Rua, número, complemento, bairro"
                rows={2}
                className="mt-1 bg-papel border-tinta/15 text-tinta placeholder:text-tinta/40 focus-visible:ring-pimenta"
              />
            </div>
          </div>
        )}
      </section>

      {/* Pagamento */}
      <section>
        <h2 className="font-display text-base font-bold text-tinta">Pagamento</h2>
        <div className="mt-2 space-y-1.5">
          {acceptsPix && (
            <label
              className={`flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-2.5 text-sm transition-colors ${
                paymentMethod === 'PIX'
                  ? 'border-pimenta bg-pimenta/10 text-pimenta'
                  : 'border-tinta/15 text-tinta/60 hover:border-tinta/30'
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
              className={`flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-2.5 text-sm transition-colors ${
                paymentMethod === 'CASH'
                  ? 'border-pimenta bg-pimenta/10 text-pimenta'
                  : 'border-tinta/15 text-tinta/60 hover:border-tinta/30'
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
              className={`flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-2.5 text-sm transition-colors ${
                paymentMethod === 'CARD_ON_DELIVERY'
                  ? 'border-pimenta bg-pimenta/10 text-pimenta'
                  : 'border-tinta/15 text-tinta/60 hover:border-tinta/30'
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

        {paymentMethod === 'CASH' && (
          <div className="mt-3">
            <label htmlFor="change" className="text-sm font-medium text-tinta/70">
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
              className="mt-1 bg-papel border-tinta/15 text-tinta placeholder:text-tinta/40 focus-visible:ring-pimenta"
            />
          </div>
        )}
      </section>

      {/* Observações */}
      <section>
        <h2 className="font-display text-base font-bold text-tinta">Observações</h2>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Alguma observação para o estabelecimento?"
          rows={2}
          className="mt-2 bg-papel border-tinta/15 text-tinta placeholder:text-tinta/40 focus-visible:ring-pimenta"
        />
      </section>

      {/* Resumo */}
      <OrderSummary
        items={items}
        subtotal={subtotal}
        deliveryFee={deliveryFee}
        total={total}
      />

      {/* Erro */}
      {error && (
        <div className="rounded-lg border border-error/20 bg-error-light px-4 py-2 text-sm text-error">
          {error}
        </div>
      )}

      {/* Submit */}
      <Button
        type="submit"
        disabled={isPending || items.length === 0}
        className="storefront-primary-action w-full font-body font-medium shadow-sm disabled:opacity-50"
      >
        {isPending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Processando...
          </>
        ) : (
          `Fazer Pedido · ${formatCurrency(total)}`
        )}
      </Button>
    </form>
  );
}

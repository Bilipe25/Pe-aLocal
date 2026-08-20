'use client';

import { Banknote, CreditCard, Loader2, QrCode, ReceiptText, Utensils } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { createDineInOrderAction } from '@/features/orders/actions';
import { useCheckoutQuote } from '@/hooks/use-checkout-quote';
import {
  clearCheckoutIdempotency,
  resolveCheckoutIdempotency,
  type CheckoutIdempotencyRecord,
} from '@/lib/orders/checkout-idempotency';
import { formatCurrency } from '@/lib/utils';
import { useCartStore } from '@/stores/cart-store';

type DineInPaymentMethod = 'PIX' | 'CASH' | 'CARD_IN_PERSON';

interface DineInCheckoutProps {
  tableToken: string;
  tableLabel: string;
  storeSlug: string;
  storeName: string;
  cartScopeId: string;
  paymentMethods: Array<{ method: DineInPaymentMethod; processing: 'ONLINE' | 'MANUAL' }>;
}

const paymentPresentation = {
  CASH: { label: 'Dinheiro', detail: 'Pague à equipe na mesa', icon: Banknote },
  CARD_IN_PERSON: { label: 'Cartão', detail: 'A maquininha vai até você', icon: CreditCard },
  PIX: { label: 'Pix online', detail: 'Confirmação automática', icon: QrCode },
} as const;

function sessionStorageOrNull() {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function DineInCheckout({
  tableToken,
  tableLabel,
  storeSlug,
  storeName,
  cartScopeId,
  paymentMethods,
}: DineInCheckoutProps) {
  const items = useCartStore((state) => state.items);
  const activeStoreId = useCartStore((state) => state.storeId);
  const setStore = useCartStore((state) => state.setStore);
  const clearCart = useCartStore((state) => state.clearCart);
  const couponCode = useCartStore((state) => state.couponCode);
  const [customerName, setCustomerName] = useState('');
  const [notes, setNotes] = useState('');
  const [payerEmail, setPayerEmail] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [payerEmailError, setPayerEmailError] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<DineInPaymentMethod>(
    paymentMethods[0]?.method ?? 'CASH',
  );
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<{ orderNumber: number; token: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const idempotencyRef = useRef<CheckoutIdempotencyRecord | null>(null);
  const customerNameRef = useRef<HTMLInputElement>(null);
  const payerEmailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setStore(cartScopeId, storeSlug);
  }, [cartScopeId, setStore, storeSlug]);

  const quoteInput = useMemo(
    () => ({
      couponCode: couponCode ?? undefined,
      items: items.map((item) => ({
        lineId: item.id,
        productId: item.productId,
        quantity: item.quantity,
        notes: item.notes,
        optionIds: item.selectedOptions.map((option) => option.id),
      })),
    }),
    [couponCode, items],
  );
  const quote = useCheckoutQuote({
    storeSlug,
    input: items.length ? quoteInput : null,
    quoteEndpoint: `/api/storefront/q/${encodeURIComponent(tableToken)}/checkout/quote`,
    debounceMs: 100,
  });
  const onlinePixSelected = paymentMethod === 'PIX';

  function submit() {
    setSubmitError(null);
    setNameError(null);
    setPayerEmailError(null);
    if (!customerName.trim()) {
      setNameError('Informe como podemos chamar você.');
      customerNameRef.current?.focus();
      return;
    }
    if (!quote.quote?.canCheckout) {
      setSubmitError(quote.error?.message ?? quote.quote?.issues[0]?.message ?? 'Aguarde os valores.');
      return;
    }
    if (onlinePixSelected && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(payerEmail.trim())) {
      setPayerEmailError('Informe um e-mail válido para gerar o Pix.');
      payerEmailRef.current?.focus();
      return;
    }

    startTransition(async () => {
      const payload = {
        ...quoteInput,
        customerName: customerName.trim(),
        paymentMethod,
        payerEmail: onlinePixSelected ? payerEmail.trim() : undefined,
        notes: notes.trim(),
        expectedQuoteFingerprint: quote.quote!.quoteFingerprint,
      };
      const storage = sessionStorageOrNull();
      const storageKey = `checkout-idempotency:${cartScopeId}`;
      idempotencyRef.current = await resolveCheckoutIdempotency(
        payload,
        storage,
        storageKey,
        idempotencyRef.current,
      );
      const result = await createDineInOrderAction(tableToken, {
        ...payload,
        idempotencyKey: idempotencyRef.current.key,
      });
      if (!result.success) {
        if (result.error.code === 'QUOTE_CHANGED') await quote.refetch();
        if (result.error.code === 'PAYMENT_CREATION_FAILED') {
          idempotencyRef.current = null;
          clearCheckoutIdempotency(storage, storageKey);
        }
        setSubmitError(result.error.message);
        return;
      }
      clearCheckoutIdempotency(storage, storageKey);
      idempotencyRef.current = null;
      clearCart();
      setConfirmed({ orderNumber: result.data.orderNumber, token: result.data.publicToken });
    });
  }

  if (activeStoreId !== cartScopeId) {
    return <p className="dine-in-loading">Carregando sua sacola…</p>;
  }

  if (confirmed) {
    return (
      <main className="dine-in-success">
        <span className="dine-in-success-icon"><ReceiptText aria-hidden="true" /></span>
        <p className="dine-in-table-chip"><Utensils aria-hidden="true" /> {tableLabel}</p>
        <h1>Pedido #{confirmed.orderNumber} recebido</h1>
        <p>A confirmação está pendente. Você pode acompanhar o preparo sem sair da mesa.</p>
        <div className="dine-in-success-actions">
          <Button asChild className="storefront-primary-action">
            <Link href={`/q/${tableToken}/order/${confirmed.token}`}>Acompanhar pedido</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/q/${tableToken}`}>Fazer outro pedido</Link>
          </Button>
        </div>
      </main>
    );
  }

  if (items.length === 0) {
    return (
      <main className="dine-in-empty">
        <ReceiptText aria-hidden="true" />
        <h1>Sua sacola está vazia</h1>
        <Button asChild className="storefront-primary-action">
          <Link href={`/q/${tableToken}`}>Voltar ao cardápio</Link>
        </Button>
      </main>
    );
  }

  return (
    <main className="dine-in-checkout">
      <header className="dine-in-checkout-header">
        <p className="dine-in-table-chip"><Utensils aria-hidden="true" /> Você está na {tableLabel}</p>
        <h1>Finalizar pedido</h1>
        <p>{storeName}</p>
      </header>

      <section className="dine-in-checkout-summary" aria-labelledby="dine-summary-title">
        <h2 id="dine-summary-title">Seu pedido</h2>
        <ul>
          {items.map((item) => (
            <li key={item.id}>
              <span>{item.quantity}× {item.productName}</span>
              <strong>{formatCurrency(item.quantity * item.unitPrice)}</strong>
            </li>
          ))}
        </ul>
        <div className="dine-in-checkout-total">
          <span>Total</span>
          <strong>{quote.isLoading ? 'Atualizando…' : formatCurrency(quote.quote?.total ?? 0)}</strong>
        </div>
      </section>

      <section className="dine-in-checkout-fields" aria-label="Seus dados e pagamento">
        <label>
          <span>Como podemos chamar você?</span>
          <input
            ref={customerNameRef}
            value={customerName}
            onChange={(event) => { setCustomerName(event.target.value); setNameError(null); }}
            maxLength={40}
            autoComplete="given-name"
            placeholder="Seu primeiro nome"
            aria-invalid={Boolean(nameError)}
            aria-describedby={nameError ? 'dine-customer-name-error' : undefined}
          />
          {nameError ? <small id="dine-customer-name-error" className="dine-in-field-error">{nameError}</small> : null}
        </label>

        <fieldset>
          <legend>Como prefere pagar?</legend>
          <div className="dine-in-payment-options">
            {paymentMethods.map((method) => {
              const presentation = paymentPresentation[method.method];
              const Icon = presentation.icon;
              return (
                <label key={method.method} data-selected={paymentMethod === method.method}>
                  <input
                    type="radio"
                    name="dine-in-payment"
                    value={method.method}
                    checked={paymentMethod === method.method}
                    onChange={() => setPaymentMethod(method.method)}
                  />
                  <Icon aria-hidden="true" />
                  <span><strong>{presentation.label}</strong><small>{presentation.detail}</small></span>
                </label>
              );
            })}
          </div>
        </fieldset>

        {onlinePixSelected ? (
          <label>
            <span>E-mail para gerar o Pix</span>
            <input
              ref={payerEmailRef}
              type="email"
              value={payerEmail}
              onChange={(event) => { setPayerEmail(event.target.value); setPayerEmailError(null); }}
              maxLength={254}
              autoComplete="email"
              placeholder="voce@exemplo.com"
              aria-invalid={Boolean(payerEmailError)}
              aria-describedby={payerEmailError ? 'dine-payer-email-error' : undefined}
            />
            {payerEmailError ? <small id="dine-payer-email-error" className="dine-in-field-error">{payerEmailError}</small> : null}
          </label>
        ) : null}

        <label>
          <span>Observação <small>(opcional)</small></span>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            maxLength={500}
            rows={3}
            placeholder="Ex.: sem cebola"
          />
        </label>
      </section>

      {submitError ? <p className="dine-in-checkout-error" role="alert">{submitError}</p> : null}
      <footer className="dine-in-checkout-footer">
        <span className="dine-in-footer-context"><Utensils aria-hidden="true" /> Total na {tableLabel}</span>
        <Button
          type="button"
          className="storefront-primary-action"
          disabled={isPending || quote.isLoading || !quote.quote?.canCheckout || paymentMethods.length === 0}
          onClick={submit}
        >
          {isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
          {isPending ? 'Enviando pedido…' : `Confirmar pedido · ${formatCurrency(quote.quote?.total ?? 0)}`}
        </Button>
      </footer>
    </main>
  );
}

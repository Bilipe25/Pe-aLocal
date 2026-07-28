'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  AlertTriangle,
  Banknote,
  Bike,
  Check,
  ChevronLeft,
  CreditCard,
  Loader2,
  MapPin,
  QrCode,
  ReceiptText,
  Store,
  Tag,
  UserRound,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import {
  type FieldPath,
  type SubmitErrorHandler,
  type SubmitHandler,
  useForm,
  useWatch,
} from 'react-hook-form';
import {
  boolean,
  enum as enumSchema,
  maxLength,
  minLength,
  object,
  refine,
  string,
  superRefine,
  trim,
  type infer as Infer,
} from 'zod/v4-mini';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { createOrderAction } from '@/features/orders/actions';
import { useCheckoutQuote } from '@/hooks/use-checkout-quote';
import { formatPhoneInput, validateBrazilianPhone } from '@/lib/brazil';
import {
  clearCheckoutDraft,
  readCheckoutDraft,
  writeCheckoutDraft,
} from '@/lib/checkout/checkout-draft';
import { reportCheckoutAbandonment, reportCheckoutEvent } from '@/lib/checkout/telemetry';
import {
  clearCheckoutIdempotency,
  resolveCheckoutIdempotency,
  type CheckoutIdempotencyRecord,
} from '@/lib/orders/checkout-idempotency';
import { storePaymentReportToken } from '@/lib/orders/payment-report-token-memory';
import { cn, formatCurrency } from '@/lib/utils';
import type { CheckoutQuoteInput } from '@/schemas/checkout';
import { selectCartCouponCode, subscribeToCartStorage, useCartStore } from '@/stores/cart-store';
import { useLastOrderStore } from '@/stores/last-order-store';
import type { CheckoutQuoteDto } from '@/types/storefront';

const checkoutFormSchema = object({
  customerName: string().check(trim(), minLength(2, 'Informe seu nome.'), maxLength(100)),
  customerPhone: string().check(
    trim(),
    refine(validateBrazilianPhone, 'Informe um telefone brasileiro válido.'),
  ),
  modality: enumSchema(['DELIVERY', 'PICKUP']),
  deliveryPostalCode: string().check(maxLength(9)),
  address: object({
    street: string().check(trim(), maxLength(160)),
    number: string().check(trim(), maxLength(30)),
    complement: string().check(trim(), maxLength(120, 'Use no máximo 120 caracteres.')),
    neighborhood: string().check(trim(), maxLength(120)),
    city: string().check(trim(), maxLength(120)),
    state: string().check(trim(), maxLength(2)),
    reference: string().check(trim(), maxLength(200, 'Use no máximo 200 caracteres.')),
  }),
  paymentMethod: enumSchema(['PIX', 'CASH', 'CARD_ON_DELIVERY']),
  cashWithoutChange: boolean(),
  changeFor: string().check(maxLength(20)),
  couponCode: string().check(trim(), maxLength(32)),
  notes: string().check(trim(), maxLength(500, 'Use no máximo 500 caracteres.')),
}).check(
  superRefine((data, ctx) => {
    if (data.modality === 'DELIVERY') {
      if (!/^\d{5}-?\d{3}$/.test(data.deliveryPostalCode)) {
        ctx.addIssue({
          code: 'custom',
          path: ['deliveryPostalCode'],
          message: 'Informe um CEP com 8 números.',
          input: data.deliveryPostalCode,
        });
      }
      const requiredAddressFields = [
        ['street', 'Informe a rua.'],
        ['number', 'Informe o número.'],
        ['neighborhood', 'Informe o bairro.'],
        ['city', 'Informe a cidade.'],
      ] as const;
      for (const [field, message] of requiredAddressFields) {
        if (data.address[field].trim().length < 2 && field !== 'number') {
          ctx.addIssue({
            code: 'custom',
            path: ['address', field],
            message,
            input: data.address[field],
          });
        } else if (field === 'number' && !data.address.number.trim()) {
          ctx.addIssue({
            code: 'custom',
            path: ['address', field],
            message,
            input: data.address.number,
          });
        }
      }
      if (!/^[A-Za-z]{2}$/.test(data.address.state)) {
        ctx.addIssue({
          code: 'custom',
          path: ['address', 'state'],
          message: 'Informe a UF com 2 letras.',
          input: data.address.state,
        });
      }
    }
    if (
      data.paymentMethod === 'CASH' &&
      !data.cashWithoutChange &&
      (!data.changeFor || Number(data.changeFor.replace(',', '.')) <= 0)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['changeFor'],
        message: 'Informe o valor em dinheiro ou escolha “Sem troco”.',
        input: data.changeFor,
      });
    }
  }),
);

type CheckoutFormValues = Infer<typeof checkoutFormSchema>;
type CheckoutStep = 'identification' | 'fulfillment' | 'payment' | 'review';

export interface CheckoutFormProps {
  storeId: string;
  storeSlug: string;
  minOrderValue: number;
  deliveryEnabled: boolean;
  pickupEnabled: boolean;
  acceptsPix: boolean;
  acceptsCash: boolean;
  acceptsCardOnDelivery: boolean;
  initialStep?: CheckoutStep;
  initialModality?: 'DELIVERY' | 'PICKUP';
  initialCouponCode?: string;
  /** Compatibilidade de chamada; zonas nunca são aceitas como fonte de verdade. */
  deliveryZones?: unknown[];
}

const STEPS: Array<{ id: CheckoutStep; label: string; shortLabel: string }> = [
  { id: 'identification', label: 'Identificação', shortLabel: 'Você' },
  { id: 'fulfillment', label: 'Recebimento', shortLabel: 'Receber' },
  { id: 'payment', label: 'Pagamento', shortLabel: 'Pagar' },
  { id: 'review', label: 'Revisão', shortLabel: 'Revisar' },
];

function getSessionStorage() {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function formatPostalCode(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
}

function quoteFromErrorDetails(
  details: Record<string, unknown>[] | undefined,
): CheckoutQuoteDto | null {
  const candidate = details?.find((detail) => detail.quote)?.quote;
  if (
    !candidate ||
    typeof candidate !== 'object' ||
    !('quoteFingerprint' in candidate) ||
    typeof candidate.quoteFingerprint !== 'string'
  ) {
    return null;
  }
  return candidate as CheckoutQuoteDto;
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="text-error mt-1 text-sm" role="alert">
      {message}
    </p>
  );
}

function QuoteSummary({ quote }: { quote: CheckoutQuoteDto }) {
  return (
    <div className="border-tinta/10 bg-papel rounded-2xl border p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <ReceiptText className="storefront-action-text h-5 w-5" aria-hidden="true" />
        <h2 className="font-display text-tinta text-base font-bold">Resumo do pedido</h2>
      </div>
      <div className="mt-4 space-y-3">
        {quote.lines.map((line) => (
          <div key={line.lineId} className="flex items-start justify-between gap-3 text-sm">
            <div className="min-w-0">
              <p className="text-tinta font-medium">
                {line.quantity}× {line.productName}
              </p>
              {line.options.length > 0 && (
                <p className="text-text-muted mt-1 break-words">
                  {line.options.map((option) => option.name).join(', ')}
                </p>
              )}
            </div>
            <span className="text-tinta shrink-0 font-mono font-bold">
              {formatCurrency(line.itemTotal)}
            </span>
          </div>
        ))}
      </div>
      <dl className="border-tinta/10 mt-4 space-y-2 border-t pt-4 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-text-muted">Subtotal</dt>
          <dd className="text-tinta font-mono">{formatCurrency(quote.subtotal)}</dd>
        </div>
        {quote.discount > 0 && (
          <div className="flex justify-between gap-3">
            <dt className="text-success">Desconto {quote.coupon?.code}</dt>
            <dd className="text-success font-mono">− {formatCurrency(quote.discount)}</dd>
          </div>
        )}
        {quote.deliveryFee > 0 && (
          <div className="flex justify-between gap-3">
            <dt className="text-text-muted">Entrega</dt>
            <dd className="text-tinta font-mono">{formatCurrency(quote.deliveryFee)}</dd>
          </div>
        )}
        <div className="border-tinta/10 flex justify-between gap-3 border-t pt-3 text-base">
          <dt className="text-tinta font-bold">Total</dt>
          <dd className="storefront-action-text font-mono font-bold">
            {formatCurrency(quote.total)}
          </dd>
        </div>
      </dl>
    </div>
  );
}

function QuoteChanges({
  previous,
  next,
}: {
  previous: CheckoutQuoteDto | null;
  next: CheckoutQuoteDto;
}) {
  const changes = describeQuoteChanges(previous, next);

  return (
    <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm" aria-label="Alterações da cotação">
      {changes.map((change, index) => (
        <li key={`${index}:${change}`}>{change}</li>
      ))}
    </ul>
  );
}

function quoteOptionsLabel(options: CheckoutQuoteDto['lines'][number]['options']) {
  if (options.length === 0) return 'sem adicionais';
  return options.map((option) => `${option.name} (${formatCurrency(option.price)})`).join(', ');
}

function sameQuoteOptions(
  previous: CheckoutQuoteDto['lines'][number]['options'],
  next: CheckoutQuoteDto['lines'][number]['options'],
) {
  if (previous.length !== next.length) return false;
  return previous.every((option, index) => {
    const candidate = next[index];
    return (
      candidate?.id === option.id &&
      candidate.name === option.name &&
      candidate.price === option.price
    );
  });
}

function quoteIssueKey(issue: CheckoutQuoteDto['issues'][number]) {
  return `${issue.lineId ?? 'quote'}:${issue.code}:${issue.message}`;
}

export function describeQuoteChanges(previous: CheckoutQuoteDto | null, next: CheckoutQuoteDto) {
  if (!previous) {
    return ['A cotação foi recalculada. Confira os itens, condições e valores abaixo.'];
  }

  const changes: string[] = [];
  const previousLines = new Map(previous.lines.map((line) => [line.lineId, line]));
  const nextLines = new Map(next.lines.map((line) => [line.lineId, line]));

  for (const line of previous.lines) {
    if (!nextLines.has(line.lineId)) {
      changes.push(`Item removido: ${line.quantity}× ${line.productName}.`);
    }
  }

  for (const line of next.lines) {
    const prior = previousLines.get(line.lineId);
    if (!prior) {
      changes.push(
        `Item adicionado: ${line.quantity}× ${line.productName} por ${formatCurrency(line.itemTotal)}.`,
      );
      continue;
    }

    if (prior.productId !== line.productId) {
      changes.push(`A referência do item ${line.productName} foi atualizada.`);
    }
    if (prior.productName !== line.productName) {
      changes.push(`Nome do item: “${prior.productName}” agora é “${line.productName}”.`);
    }
    if (prior.quantity !== line.quantity) {
      changes.push(`Quantidade de ${line.productName}: ${prior.quantity} → ${line.quantity}.`);
    }
    if (!sameQuoteOptions(prior.options, line.options)) {
      changes.push(
        `Adicionais de ${line.productName}: ${quoteOptionsLabel(prior.options)} → ${quoteOptionsLabel(line.options)}.`,
      );
    }
    if (prior.unitPrice !== line.unitPrice) {
      changes.push(
        `Preço unitário de ${line.productName}: ${formatCurrency(prior.unitPrice)} → ${formatCurrency(line.unitPrice)}.`,
      );
    }
    if (prior.itemTotal !== line.itemTotal) {
      changes.push(
        `Total de ${line.productName}: ${formatCurrency(prior.itemTotal)} → ${formatCurrency(line.itemTotal)}.`,
      );
    }
    if (prior.notes !== line.notes) {
      changes.push(`A observação de ${line.productName} foi atualizada.`);
    }
  }

  if (
    previous.deliveryZoneId !== next.deliveryZoneId ||
    previous.deliveryZoneName !== next.deliveryZoneName
  ) {
    if (next.deliveryZoneName) {
      changes.push(`Região de entrega atualizada para ${next.deliveryZoneName}.`);
    } else {
      changes.push('A região de entrega anterior não está mais disponível.');
    }
  }

  if (
    previous.estimatedMinMinutes !== next.estimatedMinMinutes ||
    previous.estimatedMaxMinutes !== next.estimatedMaxMinutes
  ) {
    if (
      typeof next.estimatedMinMinutes === 'number' &&
      typeof next.estimatedMaxMinutes === 'number'
    ) {
      const range =
        next.estimatedMinMinutes === next.estimatedMaxMinutes
          ? `${next.estimatedMinMinutes} min`
          : `${next.estimatedMinMinutes}–${next.estimatedMaxMinutes} min`;
      changes.push(`Prazo estimado atualizado para ${range}.`);
    } else {
      changes.push('O prazo estimado foi atualizado.');
    }
  }

  const previousCoupon = previous.coupon?.code ?? null;
  const nextCoupon = next.coupon?.code ?? null;
  if (previousCoupon !== nextCoupon) {
    if (!previousCoupon && nextCoupon) {
      changes.push(`Cupom ${nextCoupon} aplicado.`);
    } else if (previousCoupon && !nextCoupon) {
      changes.push(`Cupom ${previousCoupon} removido.`);
    } else {
      changes.push(`Cupom alterado de ${previousCoupon} para ${nextCoupon}.`);
    }
  }

  if (previous.subtotal !== next.subtotal) {
    changes.push(
      `Subtotal: ${formatCurrency(previous.subtotal)} → ${formatCurrency(next.subtotal)}.`,
    );
  }
  if (previous.discount !== next.discount) {
    changes.push(
      `Desconto: ${formatCurrency(previous.discount)} → ${formatCurrency(next.discount)}.`,
    );
  }
  if (previous.deliveryFee !== next.deliveryFee) {
    changes.push(
      `Taxa de entrega: ${formatCurrency(previous.deliveryFee)} → ${formatCurrency(next.deliveryFee)}.`,
    );
  }
  if (previous.total !== next.total) {
    changes.push(`Total: ${formatCurrency(previous.total)} → ${formatCurrency(next.total)}.`);
  }

  const previousIssues = new Set(previous.issues.map(quoteIssueKey));
  const nextIssues = new Set(next.issues.map(quoteIssueKey));
  for (const issue of previous.issues) {
    if (!nextIssues.has(quoteIssueKey(issue))) {
      changes.push(`Resolvido: ${issue.message}`);
    }
  }
  for (const issue of next.issues) {
    if (!previousIssues.has(quoteIssueKey(issue))) {
      changes.push(`Atenção: ${issue.message}`);
    }
  }

  if (previous.canCheckout !== next.canCheckout) {
    changes.push(
      next.canCheckout
        ? 'O pedido está liberado para confirmação.'
        : 'O pedido precisa de ajustes antes da confirmação.',
    );
  }

  if (changes.length === 0) {
    changes.push('A cotação foi recalculada. Confira os itens, condições e valores abaixo.');
  }
  return changes;
}

export function CheckoutForm({
  storeId,
  storeSlug,
  deliveryEnabled,
  pickupEnabled,
  acceptsPix,
  acceptsCash,
  acceptsCardOnDelivery,
  initialStep = 'identification',
  initialModality,
  initialCouponCode = '',
}: CheckoutFormProps) {
  const router = useRouter();
  const items = useCartStore((state) => state.items);
  const activeStoreId = useCartStore((state) => state.storeId);
  const setStore = useCartStore((state) => state.setStore);
  const clearCart = useCartStore((state) => state.clearCart);
  const cartCouponCode = useCartStore(selectCartCouponCode);
  const setCartCouponCode = useCartStore((state) => state.setCouponCode);
  const [step, setStepState] = useState<CheckoutStep>(initialStep);
  const [isPending, startTransition] = useTransition();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [changedQuote, setChangedQuote] = useState<CheckoutQuoteDto | null>(null);
  const [acceptedChangedQuote, setAcceptedChangedQuote] = useState<CheckoutQuoteDto | null>(null);
  const idempotencyRef = useRef<CheckoutIdempotencyRecord | null>(null);
  const completedRef = useRef(false);
  const restoredRef = useRef(false);
  const telemetryStartedRef = useRef(false);
  const telemetryAbandonedRef = useRef(false);
  const telemetryStepRef = useRef<CheckoutStep>(initialStep);
  const lastReportedStepRef = useRef<CheckoutStep | null>(null);
  const [focusRequest, setFocusRequest] = useState<{
    field: FieldPath<CheckoutFormValues>;
  } | null>(null);
  const canDeliver = deliveryEnabled;
  const defaultModality =
    initialModality === 'DELIVERY' && canDeliver
      ? 'DELIVERY'
      : initialModality === 'PICKUP' && pickupEnabled
        ? 'PICKUP'
        : canDeliver
          ? 'DELIVERY'
          : 'PICKUP';
  const defaultPayment = acceptsPix ? 'PIX' : acceptsCash ? 'CASH' : 'CARD_ON_DELIVERY';

  const {
    control,
    register,
    handleSubmit,
    setValue,
    setError,
    setFocus,
    clearErrors,
    trigger,
    formState: { errors },
    reset,
  } = useForm<CheckoutFormValues>({
    resolver: zodResolver(checkoutFormSchema),
    mode: 'onBlur',
    defaultValues: {
      customerName: '',
      customerPhone: '',
      modality: defaultModality,
      deliveryPostalCode: '',
      address: {
        street: '',
        number: '',
        complement: '',
        neighborhood: '',
        city: '',
        state: '',
        reference: '',
      },
      paymentMethod: defaultPayment,
      cashWithoutChange: true,
      changeFor: '',
      couponCode: initialCouponCode,
      notes: '',
    },
  });

  // Todos os campos têm default e o reset sempre preserva a estrutura completa.
  const values = useWatch({ control }) as CheckoutFormValues;
  const normalizedPostalCode = values.deliveryPostalCode.replace(/\D/g, '');
  const quoteInput = useMemo<CheckoutQuoteInput | null>(() => {
    if (activeStoreId !== storeId || items.length === 0) return null;
    if (values.modality === 'DELIVERY' && normalizedPostalCode.length !== 8) return null;
    return {
      modality: values.modality,
      deliveryPostalCode: values.modality === 'DELIVERY' ? normalizedPostalCode : undefined,
      couponCode: values.couponCode.trim() || undefined,
      items: items.map((item) => ({
        lineId: item.id,
        productId: item.productId,
        quantity: item.quantity,
        notes: item.notes,
        optionIds: item.selectedOptions.map((option) => option.id),
      })),
    };
  }, [activeStoreId, items, normalizedPostalCode, storeId, values.couponCode, values.modality]);
  const {
    quote,
    error: quoteError,
    isLoading: quoteLoading,
    refetch: refetchQuote,
  } = useCheckoutQuote({ storeSlug, input: quoteInput });
  const effectiveQuote = acceptedChangedQuote ?? quote;

  useEffect(() => {
    setStore(storeId, storeSlug);
    return subscribeToCartStorage(storeId, storeSlug);
  }, [setStore, storeId, storeSlug]);

  useEffect(() => {
    if (!focusRequest) return;
    const frame = requestAnimationFrame(() => setFocus(focusRequest.field));
    return () => cancelAnimationFrame(frame);
  }, [focusRequest, setFocus, step]);

  useEffect(() => {
    telemetryStepRef.current = step;
    if (activeStoreId !== storeId || items.length === 0) return;
    if (!telemetryStartedRef.current) {
      telemetryStartedRef.current = true;
      reportCheckoutEvent(storeSlug, { event: 'checkout_started', step });
    }
    if (lastReportedStepRef.current !== step) {
      lastReportedStepRef.current = step;
      reportCheckoutEvent(storeSlug, { event: 'checkout_step_viewed', step });
    }
  }, [activeStoreId, items.length, step, storeId, storeSlug]);

  useEffect(() => {
    const reportAbandonment = (reason: 'navigation' | 'page_hidden') => {
      if (completedRef.current || !telemetryStartedRef.current || telemetryAbandonedRef.current) {
        return;
      }
      telemetryAbandonedRef.current = true;
      reportCheckoutAbandonment(storeSlug, telemetryStepRef.current, reason);
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') reportAbandonment('page_hidden');
    };
    const handlePageHide = () => reportAbandonment('navigation');
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('pagehide', handlePageHide);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [storeSlug]);

  useEffect(() => {
    if (activeStoreId !== storeId || restoredRef.current) return;
    restoredRef.current = true;
    const draft = readCheckoutDraft(getSessionStorage(), storeId);
    if (!draft) {
      if (!initialCouponCode && cartCouponCode) {
        setValue('couponCode', cartCouponCode);
      }
      return;
    }
    reset((current) => ({
      ...current,
      customerName: draft.customerName,
      customerPhone: formatPhoneInput(draft.customerPhone),
      modality: initialModality
        ? defaultModality
        : draft.modality === 'DELIVERY' && canDeliver
          ? 'DELIVERY'
          : draft.modality === 'PICKUP' && pickupEnabled
            ? 'PICKUP'
            : defaultModality,
      paymentMethod:
        (draft.paymentMethod === 'PIX' && acceptsPix) ||
        (draft.paymentMethod === 'CASH' && acceptsCash) ||
        (draft.paymentMethod === 'CARD_ON_DELIVERY' && acceptsCardOnDelivery)
          ? draft.paymentMethod
          : defaultPayment,
      deliveryPostalCode: formatPostalCode(draft.deliveryPostalCode || ''),
      address: draft.address ?? current.address,
      couponCode: initialCouponCode || cartCouponCode || draft.couponCode || '',
    }));
  }, [
    acceptsCardOnDelivery,
    acceptsCash,
    acceptsPix,
    activeStoreId,
    canDeliver,
    cartCouponCode,
    defaultModality,
    defaultPayment,
    initialCouponCode,
    initialModality,
    pickupEnabled,
    reset,
    setValue,
    storeId,
  ]);

  useEffect(() => {
    if (!restoredRef.current || completedRef.current) return;
    const timer = window.setTimeout(() => {
      writeCheckoutDraft(getSessionStorage(), storeId, {
        customerName: values.customerName,
        customerPhone: values.customerPhone,
        modality: values.modality,
        deliveryPostalCode: values.deliveryPostalCode,
        address: values.address,
        couponCode: values.couponCode,
        paymentMethod: values.paymentMethod,
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [
    storeId,
    values.address,
    values.couponCode,
    values.customerName,
    values.customerPhone,
    values.deliveryPostalCode,
    values.modality,
    values.paymentMethod,
  ]);

  useEffect(() => {
    if (activeStoreId !== storeId || !restoredRef.current) return;
    const timer = window.setTimeout(() => {
      setCartCouponCode(values.couponCode);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [activeStoreId, setCartCouponCode, storeId, values.couponCode]);

  const quoteInputKey = useMemo(() => JSON.stringify(quoteInput), [quoteInput]);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setChangedQuote(null);
      setAcceptedChangedQuote(null);
      setSubmitError(null);
    });
    return () => {
      active = false;
    };
  }, [quoteInputKey]);

  function setStep(nextStep: CheckoutStep) {
    setStepState(nextStep);
    const query = new URLSearchParams({ step: nextStep, modality: values.modality });
    const normalizedCoupon = values.couponCode.trim().toUpperCase();
    if (normalizedCoupon) query.set('coupon', normalizedCoupon);
    router.replace(`/${storeSlug}/checkout?${query.toString()}`, { scroll: false });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function goForward() {
    const fieldsByStep: Record<Exclude<CheckoutStep, 'review'>, FieldPath<CheckoutFormValues>[]> = {
      identification: ['customerName', 'customerPhone'],
      fulfillment: ['modality'],
      payment: ['paymentMethod', 'cashWithoutChange', 'changeFor'],
    };
    if (step === 'review') return;
    const baseFields =
      step === 'fulfillment' && values.modality === 'DELIVERY'
        ? (['modality', 'deliveryPostalCode'] as FieldPath<CheckoutFormValues>[])
        : fieldsByStep[step];
    const valid = await trigger(baseFields, { shouldFocus: true });
    if (!valid) return;
    if (step === 'fulfillment' && values.modality === 'DELIVERY') {
      const latestQuote = await refetchQuote();
      const coverageIssue = latestQuote?.issues.find(
        (issue) => issue.code === 'OUTSIDE_DELIVERY_AREA',
      );
      if (!latestQuote || coverageIssue || !latestQuote.deliveryZoneId) {
        setError('deliveryPostalCode', {
          message:
            coverageIssue?.message ??
            'Não foi possível confirmar a cobertura deste CEP. Tente novamente.',
        });
        return;
      }
      clearErrors('deliveryPostalCode');
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const addressValid = await trigger(
        [
          'address.street',
          'address.number',
          'address.complement',
          'address.neighborhood',
          'address.city',
          'address.state',
          'address.reference',
        ],
        { shouldFocus: true },
      );
      if (!addressValid) return;
    }
    const index = STEPS.findIndex((candidate) => candidate.id === step);
    setStep(STEPS[index + 1].id);
  }

  function goBack() {
    const index = STEPS.findIndex((candidate) => candidate.id === step);
    if (index === 0) {
      router.push(`/${storeSlug}/cart`);
      return;
    }
    setStep(STEPS[index - 1].id);
  }

  const handleValidSubmit: SubmitHandler<CheckoutFormValues> = (validValues) => {
    setSubmitError(null);
    setChangedQuote(null);
    if (!effectiveQuote || !effectiveQuote.canCheckout) {
      setSubmitError(
        effectiveQuote?.issues[0]?.message ??
          quoteError?.message ??
          'Aguarde a atualização dos valores antes de confirmar.',
      );
      return;
    }

    startTransition(async () => {
      try {
        const changeFor =
          validValues.paymentMethod === 'CASH' &&
          !validValues.cashWithoutChange &&
          validValues.changeFor
            ? Math.round(Number(validValues.changeFor.replace(',', '.')) * 100)
            : undefined;
        const payload = {
          ...quoteInput!,
          customerName: validValues.customerName,
          customerPhone: validValues.customerPhone,
          deliveryAddress:
            validValues.modality === 'DELIVERY'
              ? {
                  postalCode: normalizedPostalCode,
                  street: validValues.address.street,
                  number: validValues.address.number,
                  neighborhood: validValues.address.neighborhood,
                  city: validValues.address.city,
                  state: validValues.address.state,
                  complement: validValues.address.complement,
                  reference: validValues.address.reference,
                }
              : undefined,
          paymentMethod: validValues.paymentMethod,
          changeFor,
          notes: validValues.notes,
          expectedQuoteFingerprint: effectiveQuote.quoteFingerprint,
        };
        const storage = getSessionStorage();
        const storageKey = `checkout-idempotency:${storeSlug}`;
        idempotencyRef.current = await resolveCheckoutIdempotency(
          payload,
          storage,
          storageKey,
          idempotencyRef.current,
        );
        const result = await createOrderAction(storeSlug, {
          ...payload,
          idempotencyKey: idempotencyRef.current.key,
        });

        if (!result.success) {
          if (result.error.code === 'QUOTE_CHANGED') {
            const nextQuote = quoteFromErrorDetails(result.error.details);
            if (nextQuote) {
              reportCheckoutEvent(storeSlug, {
                event: 'checkout_quote_changed',
                step: 'review',
                reason: 'quote_changed',
              });
              setChangedQuote(nextQuote);
              setAcceptedChangedQuote(null);
              return;
            }
          }
          if (result.error.code === 'OUTSIDE_DELIVERY_AREA') {
            setError('deliveryPostalCode', { message: result.error.message });
            setStep('fulfillment');
            return;
          }
          if (result.error.code === 'COUPON_INVALID') {
            setError('couponCode', { message: result.error.message });
          }
          setSubmitError(result.error.message);
          return;
        }

        completedRef.current = true;
        reportCheckoutEvent(storeSlug, { event: 'checkout_completed', step: 'review' });
        idempotencyRef.current = null;
        clearCheckoutIdempotency(storage, storageKey);
        clearCheckoutDraft(storage, storeId);
        if (result.data.paymentReportToken) {
          storePaymentReportToken(result.data.publicToken, result.data.paymentReportToken);
        }
        useLastOrderStore.getState().registerOrder({
          trackingToken: result.data.publicToken,
          storeId,
          storeSlug,
          createdAt: new Date().toISOString(),
        });
        clearCart();
        router.push(`/${storeSlug}/order/${result.data.publicToken}`);
      } catch {
        setSubmitError('Não foi possível enviar seu pedido agora. Seus dados foram preservados.');
      }
    });
  };

  const handleInvalidSubmit: SubmitErrorHandler<CheckoutFormValues> = (invalidFields) => {
    let targetStep: CheckoutStep = 'review';
    let targetField: FieldPath<CheckoutFormValues> = 'couponCode';
    if (invalidFields.customerName || invalidFields.customerPhone) {
      targetStep = 'identification';
      targetField = invalidFields.customerName ? 'customerName' : 'customerPhone';
    } else if (
      invalidFields.modality ||
      invalidFields.deliveryPostalCode ||
      invalidFields.address
    ) {
      targetStep = 'fulfillment';
      targetField = invalidFields.deliveryPostalCode
        ? 'deliveryPostalCode'
        : invalidFields.address?.street
          ? 'address.street'
          : invalidFields.address?.neighborhood
            ? 'address.neighborhood'
            : invalidFields.address?.number
              ? 'address.number'
              : invalidFields.address?.city
                ? 'address.city'
                : invalidFields.address?.state
                  ? 'address.state'
                  : invalidFields.address?.complement
                    ? 'address.complement'
                    : invalidFields.address?.reference
                      ? 'address.reference'
                      : 'modality';
    } else if (
      invalidFields.paymentMethod ||
      invalidFields.cashWithoutChange ||
      invalidFields.changeFor
    ) {
      targetStep = 'payment';
      targetField = invalidFields.changeFor ? 'changeFor' : 'paymentMethod';
    } else if (invalidFields.notes) {
      targetField = 'notes';
    }
    setFocusRequest({ field: targetField });
    setStep(targetStep);
  };

  function submit(event: FormEvent<HTMLFormElement>) {
    void handleSubmit(handleValidSubmit, handleInvalidSubmit)(event);
  }

  if (activeStoreId !== storeId) {
    return (
      <p className="text-text-muted py-12 text-center text-sm" role="status">
        Carregando sua sacola…
      </p>
    );
  }

  if (items.length === 0) {
    return (
      <div className="border-tinta/10 bg-papel rounded-2xl border p-8 text-center">
        <ReceiptText className="text-text-muted mx-auto h-10 w-10" aria-hidden="true" />
        <h2 className="font-display text-tinta mt-4 text-xl font-bold">Sua sacola está vazia</h2>
        <p className="text-text-muted mt-2 text-sm">
          Escolha seus produtos antes de iniciar o checkout.
        </p>
        <Button asChild className="storefront-primary-action mt-6">
          <Link href={`/${storeSlug}`}>Voltar ao cardápio</Link>
        </Button>
      </div>
    );
  }

  const currentStepIndex = STEPS.findIndex((candidate) => candidate.id === step);
  const nextLabel =
    step === 'identification'
      ? 'Continuar para recebimento'
      : step === 'fulfillment'
        ? 'Continuar para pagamento'
        : 'Revisar pedido';

  return (
    <form onSubmit={submit} noValidate>
      <nav aria-label="Etapas do checkout" className="mb-8">
        <ol className="grid grid-cols-4 gap-2">
          {STEPS.map((candidate, index) => {
            const complete = index < currentStepIndex;
            const active = candidate.id === step;
            return (
              <li key={candidate.id} className="min-w-0">
                <button
                  type="button"
                  disabled={index > currentStepIndex}
                  onClick={() => index <= currentStepIndex && setStep(candidate.id)}
                  aria-current={active ? 'step' : undefined}
                  className="focus-visible:ring-pimenta group min-h-11 w-full rounded-lg text-left focus-visible:ring-2 focus-visible:outline-none disabled:cursor-default"
                >
                  <span
                    className={cn(
                      'flex h-1.5 rounded-full',
                      active || complete ? 'storefront-primary-bg' : 'bg-tinta/10',
                    )}
                  />
                  <span
                    className={cn(
                      'mt-2 block truncate text-xs font-semibold sm:text-sm',
                      active
                        ? 'text-tinta'
                        : complete
                          ? 'storefront-action-text'
                          : 'text-text-muted',
                    )}
                  >
                    <span className="sm:hidden">{candidate.shortLabel}</span>
                    <span className="hidden sm:inline">{candidate.label}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-8">
        <div className="min-w-0">
          {step === 'identification' && (
            <section aria-labelledby="identification-title" className="space-y-6">
              <header className="flex items-start gap-3">
                <span className="bg-pimenta/10 storefront-action-text flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
                  <UserRound className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <h1
                    id="identification-title"
                    className="font-display text-tinta text-xl font-bold"
                  >
                    Como podemos chamar você?
                  </h1>
                  <p className="text-text-muted mt-1 text-sm">
                    A loja usará o telefone somente para falar sobre este pedido.
                  </p>
                </div>
              </header>
              <div className="space-y-4">
                <div>
                  <label htmlFor="customerName" className="text-tinta text-sm font-semibold">
                    Nome
                  </label>
                  <Input
                    id="customerName"
                    autoComplete="name"
                    className="border-tinta/15 bg-papel focus-visible:ring-pimenta mt-1 min-h-11"
                    aria-invalid={Boolean(errors.customerName)}
                    aria-describedby={errors.customerName ? 'customerName-error' : undefined}
                    {...register('customerName')}
                  />
                  <FieldError id="customerName-error" message={errors.customerName?.message} />
                </div>
                <div>
                  <label htmlFor="customerPhone" className="text-tinta text-sm font-semibold">
                    Telefone / WhatsApp
                  </label>
                  <Input
                    id="customerPhone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    maxLength={15}
                    placeholder="(11) 99999-9999"
                    className="border-tinta/15 bg-papel focus-visible:ring-pimenta mt-1 min-h-11"
                    aria-invalid={Boolean(errors.customerPhone)}
                    aria-describedby={errors.customerPhone ? 'customerPhone-error' : undefined}
                    {...register('customerPhone', {
                      onChange: (event) =>
                        setValue('customerPhone', formatPhoneInput(event.target.value), {
                          shouldDirty: true,
                        }),
                    })}
                  />
                  <FieldError id="customerPhone-error" message={errors.customerPhone?.message} />
                </div>
              </div>
            </section>
          )}

          {step === 'fulfillment' && (
            <section aria-labelledby="fulfillment-title" className="space-y-6">
              <header className="flex items-start gap-3">
                <span className="bg-pimenta/10 storefront-action-text flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
                  <MapPin className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <h1 id="fulfillment-title" className="font-display text-tinta text-xl font-bold">
                    Como quer receber?
                  </h1>
                  <p className="text-text-muted mt-1 text-sm">
                    Para entrega, validamos primeiro se o CEP está na área atendida.
                  </p>
                </div>
              </header>

              <div
                className="grid grid-cols-2 gap-3"
                role="group"
                aria-label="Modalidade de recebimento"
                aria-describedby={errors.modality ? 'modality-error' : undefined}
              >
                {canDeliver && (
                  <button
                    type="button"
                    onClick={() => {
                      setValue('modality', 'DELIVERY', { shouldDirty: true });
                      clearErrors('modality');
                    }}
                    aria-pressed={values.modality === 'DELIVERY'}
                    className={cn(
                      'focus-visible:ring-pimenta flex min-h-14 items-center gap-3 rounded-xl border px-4 text-left text-sm font-semibold focus-visible:ring-2 focus-visible:outline-none',
                      values.modality === 'DELIVERY'
                        ? 'storefront-selection-control storefront-selection-row text-tinta'
                        : 'border-tinta/15 text-text-muted',
                    )}
                  >
                    <Bike className="h-5 w-5" aria-hidden="true" />
                    Entrega
                  </button>
                )}
                {pickupEnabled && (
                  <button
                    type="button"
                    onClick={() => {
                      setValue('modality', 'PICKUP', { shouldDirty: true });
                      clearErrors('modality');
                    }}
                    aria-pressed={values.modality === 'PICKUP'}
                    className={cn(
                      'focus-visible:ring-pimenta flex min-h-14 items-center gap-3 rounded-xl border px-4 text-left text-sm font-semibold focus-visible:ring-2 focus-visible:outline-none',
                      values.modality === 'PICKUP'
                        ? 'storefront-selection-control storefront-selection-row text-tinta'
                        : 'border-tinta/15 text-text-muted',
                    )}
                  >
                    <Store className="h-5 w-5" aria-hidden="true" />
                    Retirada
                  </button>
                )}
              </div>
              <FieldError id="modality-error" message={errors.modality?.message} />

              {values.modality === 'DELIVERY' && (
                <div className="space-y-4">
                  <div>
                    <label
                      htmlFor="deliveryPostalCode"
                      className="text-tinta text-sm font-semibold"
                    >
                      CEP
                    </label>
                    <Input
                      id="deliveryPostalCode"
                      inputMode="numeric"
                      autoComplete="postal-code"
                      placeholder="00000-000"
                      maxLength={9}
                      className="border-tinta/15 bg-papel focus-visible:ring-pimenta mt-1 min-h-11"
                      aria-invalid={Boolean(errors.deliveryPostalCode)}
                      aria-describedby={
                        errors.deliveryPostalCode
                          ? 'postal-help deliveryPostalCode-error'
                          : 'postal-help'
                      }
                      {...register('deliveryPostalCode', {
                        onChange: (event) =>
                          setValue('deliveryPostalCode', formatPostalCode(event.target.value), {
                            shouldDirty: true,
                            shouldValidate: true,
                          }),
                      })}
                    />
                    <p id="postal-help" className="text-text-muted mt-1 text-sm">
                      A região e a taxa são definidas pelo servidor.
                    </p>
                    <FieldError
                      id="deliveryPostalCode-error"
                      message={errors.deliveryPostalCode?.message}
                    />
                  </div>

                  {normalizedPostalCode.length === 8 && quoteLoading && (
                    <p className="text-text-muted flex items-center gap-2 text-sm" role="status">
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      Validando a cobertura…
                    </p>
                  )}
                  {normalizedPostalCode.length === 8 &&
                    quote?.issues.some((issue) => issue.code === 'OUTSIDE_DELIVERY_AREA') && (
                      <div className="border-error/20 bg-error-light text-tinta rounded-xl border p-3 text-sm">
                        {
                          quote.issues.find((issue) => issue.code === 'OUTSIDE_DELIVERY_AREA')
                            ?.message
                        }
                      </div>
                    )}
                  {quote?.deliveryZoneId && (
                    <div className="border-success/25 bg-success-light text-tinta rounded-xl border p-3 text-sm">
                      <p className="font-semibold">Entrega disponível · {quote.deliveryZoneName}</p>
                      <p className="mt-1">
                        Taxa {formatCurrency(quote.deliveryFee)} · prazo confirmado na revisão
                      </p>
                    </div>
                  )}

                  {quote?.deliveryZoneId && (
                    <fieldset className="space-y-4 border-0 p-0">
                      <legend className="text-tinta text-base font-bold">
                        Endereço de entrega
                      </legend>
                      <div>
                        <label htmlFor="street" className="text-tinta text-sm font-semibold">
                          Rua
                        </label>
                        <Input
                          id="street"
                          autoComplete="address-line1"
                          className="border-tinta/15 bg-papel focus-visible:ring-pimenta mt-1"
                          aria-invalid={Boolean(errors.address?.street)}
                          aria-describedby={errors.address?.street ? 'street-error' : undefined}
                          {...register('address.street')}
                        />
                        <FieldError id="street-error" message={errors.address?.street?.message} />
                      </div>
                      <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-3">
                        <div>
                          <label
                            htmlFor="neighborhood"
                            className="text-tinta text-sm font-semibold"
                          >
                            Bairro
                          </label>
                          <Input
                            id="neighborhood"
                            autoComplete="address-level3"
                            className="border-tinta/15 bg-papel focus-visible:ring-pimenta mt-1"
                            aria-invalid={Boolean(errors.address?.neighborhood)}
                            aria-describedby={
                              errors.address?.neighborhood ? 'neighborhood-error' : undefined
                            }
                            {...register('address.neighborhood')}
                          />
                          <FieldError
                            id="neighborhood-error"
                            message={errors.address?.neighborhood?.message}
                          />
                        </div>
                        <div>
                          <label htmlFor="number" className="text-tinta text-sm font-semibold">
                            Número
                          </label>
                          <Input
                            id="number"
                            autoComplete="address-line2"
                            className="border-tinta/15 bg-papel focus-visible:ring-pimenta mt-1"
                            aria-invalid={Boolean(errors.address?.number)}
                            aria-describedby={errors.address?.number ? 'number-error' : undefined}
                            {...register('address.number')}
                          />
                          <FieldError id="number-error" message={errors.address?.number?.message} />
                        </div>
                      </div>
                      <div className="grid grid-cols-[minmax(0,1fr)_5rem] gap-3">
                        <div>
                          <label htmlFor="city" className="text-tinta text-sm font-semibold">
                            Cidade
                          </label>
                          <Input
                            id="city"
                            autoComplete="address-level2"
                            className="border-tinta/15 bg-papel focus-visible:ring-pimenta mt-1"
                            aria-invalid={Boolean(errors.address?.city)}
                            aria-describedby={errors.address?.city ? 'city-error' : undefined}
                            {...register('address.city')}
                          />
                          <FieldError id="city-error" message={errors.address?.city?.message} />
                        </div>
                        <div>
                          <label htmlFor="state" className="text-tinta text-sm font-semibold">
                            UF
                          </label>
                          <Input
                            id="state"
                            autoComplete="address-level1"
                            maxLength={2}
                            className="border-tinta/15 bg-papel focus-visible:ring-pimenta mt-1 uppercase"
                            aria-invalid={Boolean(errors.address?.state)}
                            aria-describedby={errors.address?.state ? 'state-error' : undefined}
                            {...register('address.state')}
                          />
                          <FieldError id="state-error" message={errors.address?.state?.message} />
                        </div>
                      </div>
                      <div>
                        <label htmlFor="complement" className="text-tinta text-sm font-semibold">
                          Complemento{' '}
                          <span className="text-text-muted font-normal">(opcional)</span>
                        </label>
                        <Input
                          id="complement"
                          autoComplete="address-line2"
                          className="border-tinta/15 bg-papel focus-visible:ring-pimenta mt-1"
                          aria-invalid={Boolean(errors.address?.complement)}
                          aria-describedby={
                            errors.address?.complement ? 'complement-error' : undefined
                          }
                          {...register('address.complement')}
                        />
                        <FieldError
                          id="complement-error"
                          message={errors.address?.complement?.message}
                        />
                      </div>
                      <div>
                        <label htmlFor="reference" className="text-tinta text-sm font-semibold">
                          Referência <span className="text-text-muted font-normal">(opcional)</span>
                        </label>
                        <Input
                          id="reference"
                          className="border-tinta/15 bg-papel focus-visible:ring-pimenta mt-1"
                          aria-invalid={Boolean(errors.address?.reference)}
                          aria-describedby={
                            errors.address?.reference ? 'reference-error' : undefined
                          }
                          {...register('address.reference')}
                        />
                        <FieldError
                          id="reference-error"
                          message={errors.address?.reference?.message}
                        />
                      </div>
                    </fieldset>
                  )}
                </div>
              )}
            </section>
          )}

          {step === 'payment' && (
            <section aria-labelledby="payment-title" className="space-y-6">
              <header className="flex items-start gap-3">
                <span className="bg-pimenta/10 storefront-action-text flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
                  <CreditCard className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <h1 id="payment-title" className="font-display text-tinta text-xl font-bold">
                    Como prefere pagar?
                  </h1>
                  <p className="text-text-muted mt-1 text-sm">
                    O pagamento é combinado diretamente com o estabelecimento.
                  </p>
                </div>
              </header>

              <div
                className="space-y-3"
                role="radiogroup"
                aria-label="Forma de pagamento"
                aria-invalid={Boolean(errors.paymentMethod)}
                aria-describedby={errors.paymentMethod ? 'paymentMethod-error' : undefined}
              >
                {[
                  acceptsPix
                    ? {
                        value: 'PIX' as const,
                        label: 'Pix',
                        description: 'Use a chave exibida após confirmar',
                        Icon: QrCode,
                        iconClass: 'text-cyan-700 bg-cyan-50',
                      }
                    : null,
                  acceptsCash
                    ? {
                        value: 'CASH' as const,
                        label: 'Dinheiro',
                        description: 'Informe se precisa de troco',
                        Icon: Banknote,
                        iconClass: 'text-emerald-700 bg-emerald-50',
                      }
                    : null,
                  acceptsCardOnDelivery
                    ? {
                        value: 'CARD_ON_DELIVERY' as const,
                        label: 'Cartão na entrega',
                        description: 'Pague na maquininha ao receber',
                        Icon: CreditCard,
                        iconClass: 'text-amber-700 bg-amber-50',
                      }
                    : null,
                ].flatMap((method) =>
                  method
                    ? [
                        <label key={method.value} className="group relative block cursor-pointer">
                          <input
                            type="radio"
                            value={method.value}
                            className="peer sr-only"
                            {...register('paymentMethod')}
                          />
                          <span
                            className={cn(
                              'border-tinta/15 bg-papel flex min-h-16 items-center gap-3 rounded-xl border p-3 transition-colors',
                              'peer-focus-visible:ring-pimenta peer-focus-visible:ring-2 peer-focus-visible:ring-offset-2',
                              values.paymentMethod === method.value &&
                                'storefront-selection-control storefront-selection-row',
                            )}
                          >
                            <span
                              className={cn(
                                'flex h-10 w-10 items-center justify-center rounded-xl',
                                method.iconClass,
                              )}
                            >
                              <method.Icon className="h-5 w-5" aria-hidden="true" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="text-tinta block text-sm font-bold">
                                {method.label}
                              </span>
                              <span className="text-text-muted mt-1 block text-sm">
                                {method.description}
                              </span>
                            </span>
                            {values.paymentMethod === method.value && (
                              <Check
                                className="storefront-action-text h-5 w-5"
                                aria-hidden="true"
                              />
                            )}
                          </span>
                        </label>,
                      ]
                    : [],
                )}
              </div>
              <FieldError id="paymentMethod-error" message={errors.paymentMethod?.message} />

              {values.paymentMethod === 'CASH' && (
                <div className="border-tinta/10 rounded-xl border p-4">
                  <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-semibold">
                    <input
                      type="checkbox"
                      className="accent-pimenta h-5 w-5"
                      {...register('cashWithoutChange')}
                    />
                    Sem troco
                  </label>
                  {!values.cashWithoutChange && (
                    <div className="mt-3">
                      <label htmlFor="changeFor" className="text-tinta text-sm font-semibold">
                        Troco para
                      </label>
                      <Input
                        id="changeFor"
                        inputMode="decimal"
                        placeholder="Ex.: 50,00"
                        className="border-tinta/15 bg-papel focus-visible:ring-pimenta mt-1"
                        aria-invalid={Boolean(errors.changeFor)}
                        aria-describedby={errors.changeFor ? 'changeFor-error' : undefined}
                        {...register('changeFor')}
                      />
                      <FieldError id="changeFor-error" message={errors.changeFor?.message} />
                    </div>
                  )}
                </div>
              )}
            </section>
          )}

          {step === 'review' && (
            <section aria-labelledby="review-title" className="space-y-6">
              <header className="flex items-start gap-3">
                <span className="bg-pimenta/10 storefront-action-text flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
                  <ReceiptText className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <h1 id="review-title" className="font-display text-tinta text-xl font-bold">
                    Revise antes de confirmar
                  </h1>
                  <p className="text-text-muted mt-1 text-sm">
                    Confira os dados e o valor autoritativo calculado pela loja.
                  </p>
                </div>
              </header>

              {changedQuote && (
                <div
                  className="border-warning/40 bg-warning-light text-tinta rounded-2xl border p-4"
                  role="alert"
                >
                  <div className="flex gap-3">
                    <AlertTriangle className="text-warning h-5 w-5 shrink-0" aria-hidden="true" />
                    <div>
                      <p className="font-bold">O pedido mudou antes da confirmação</p>
                      <p className="mt-1 text-sm">
                        Revise todas as alterações. O pedido ainda não foi criado.
                      </p>
                    </div>
                  </div>
                  <QuoteChanges previous={quote} next={changedQuote} />
                  <Button
                    type="button"
                    className="storefront-primary-action mt-4 w-full"
                    onClick={() => {
                      setAcceptedChangedQuote(changedQuote);
                      setChangedQuote(null);
                      idempotencyRef.current = null;
                    }}
                    disabled={!changedQuote.canCheckout}
                  >
                    Aceitar nova cotação e revisar
                  </Button>
                </div>
              )}

              <div className="border-tinta/10 bg-papel divide-tinta/10 divide-y rounded-2xl border">
                <div className="flex items-start justify-between gap-4 p-4">
                  <div>
                    <p className="text-text-muted text-xs font-semibold tracking-wide uppercase">
                      Cliente
                    </p>
                    <p className="text-tinta mt-1 font-semibold">{values.customerName}</p>
                    <p className="text-text-muted text-sm">{values.customerPhone}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setStep('identification')}
                    className="storefront-link focus-visible:ring-pimenta min-h-11 px-2 text-sm font-semibold focus-visible:ring-2 focus-visible:outline-none"
                  >
                    Editar
                  </button>
                </div>
                <div className="flex items-start justify-between gap-4 p-4">
                  <div>
                    <p className="text-text-muted text-xs font-semibold tracking-wide uppercase">
                      Recebimento
                    </p>
                    <p className="text-tinta mt-1 font-semibold">
                      {values.modality === 'DELIVERY' ? 'Entrega' : 'Retirada no local'}
                    </p>
                    {values.modality === 'DELIVERY' && (
                      <p className="text-text-muted mt-1 text-sm">
                        {values.address.street}, {values.address.number} ·{' '}
                        {values.address.neighborhood}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setStep('fulfillment')}
                    className="storefront-link focus-visible:ring-pimenta min-h-11 px-2 text-sm font-semibold focus-visible:ring-2 focus-visible:outline-none"
                  >
                    Editar
                  </button>
                </div>
                <div className="flex items-start justify-between gap-4 p-4">
                  <div>
                    <p className="text-text-muted text-xs font-semibold tracking-wide uppercase">
                      Pagamento
                    </p>
                    <p className="text-tinta mt-1 font-semibold">
                      {values.paymentMethod === 'PIX'
                        ? 'Pix'
                        : values.paymentMethod === 'CASH'
                          ? 'Dinheiro'
                          : 'Cartão na entrega'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setStep('payment')}
                    className="storefront-link focus-visible:ring-pimenta min-h-11 px-2 text-sm font-semibold focus-visible:ring-2 focus-visible:outline-none"
                  >
                    Editar
                  </button>
                </div>
              </div>

              <div>
                <label
                  htmlFor="couponCode"
                  className="text-tinta flex items-center gap-2 text-sm font-semibold"
                >
                  <Tag className="h-4 w-4" aria-hidden="true" />
                  Cupom
                </label>
                <div className="mt-1 flex gap-2">
                  <Input
                    id="couponCode"
                    autoCapitalize="characters"
                    placeholder="Digite o código"
                    className="border-tinta/15 bg-papel focus-visible:ring-pimenta uppercase"
                    aria-invalid={Boolean(errors.couponCode)}
                    aria-describedby={errors.couponCode ? 'couponCode-error' : undefined}
                    {...register('couponCode')}
                  />
                  <Button type="button" variant="outline" onClick={() => void refetchQuote()}>
                    Aplicar
                  </Button>
                </div>
                <FieldError id="couponCode-error" message={errors.couponCode?.message} />
              </div>

              <div>
                <label htmlFor="notes" className="text-tinta text-sm font-semibold">
                  Observação para a loja{' '}
                  <span className="text-text-muted font-normal">(opcional)</span>
                </label>
                <Textarea
                  id="notes"
                  rows={3}
                  placeholder="Algo importante sobre o pedido?"
                  className="border-tinta/15 bg-papel focus-visible:ring-pimenta mt-1"
                  aria-invalid={Boolean(errors.notes)}
                  aria-describedby={errors.notes ? 'notes-error' : undefined}
                  {...register('notes')}
                />
                <FieldError id="notes-error" message={errors.notes?.message} />
              </div>

              <div className="lg:hidden">
                {effectiveQuote ? (
                  <QuoteSummary quote={effectiveQuote} />
                ) : (
                  <div className="border-tinta/10 bg-papel rounded-2xl border p-6 text-center">
                    <Loader2 className="text-text-muted mx-auto h-5 w-5 animate-spin" />
                    <p className="text-text-muted mt-2 text-sm">Atualizando valores…</p>
                  </div>
                )}
              </div>
            </section>
          )}

          {(submitError || quoteError) && (
            <div
              className="border-error/20 bg-error-light text-tinta mt-6 rounded-xl border p-4 text-sm"
              role="alert"
              tabIndex={-1}
            >
              {submitError ?? quoteError?.message}
            </div>
          )}
        </div>

        <aside className="hidden lg:sticky lg:top-24 lg:block">
          {effectiveQuote ? (
            <QuoteSummary quote={effectiveQuote} />
          ) : (
            <div className="border-tinta/10 bg-papel rounded-2xl border p-6 text-center">
              {quoteLoading ? (
                <Loader2 className="text-text-muted mx-auto h-5 w-5 animate-spin" />
              ) : (
                <ReceiptText className="text-text-muted mx-auto h-6 w-6" />
              )}
              <p className="text-text-muted mt-2 text-sm">
                {values.modality === 'DELIVERY'
                  ? 'Informe o CEP para calcular a entrega.'
                  : 'Atualizando valores…'}
              </p>
            </div>
          )}
        </aside>
      </div>

      <div className="purchase-step-action border-tinta/10 bg-papel/95 fixed inset-x-0 bottom-0 z-40 border-t px-4 pt-3 backdrop-blur lg:static lg:mt-8 lg:border-0 lg:bg-transparent lg:px-0 lg:pt-0">
        <div className="mx-auto flex max-w-5xl items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            onClick={goBack}
            disabled={isPending}
            className="shrink-0"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            Voltar
          </Button>
          {step !== 'review' ? (
            <Button
              type="button"
              onClick={() => void goForward()}
              className="storefront-primary-action flex-1"
            >
              {nextLabel}
            </Button>
          ) : (
            <Button
              type="submit"
              disabled={
                isPending || quoteLoading || !effectiveQuote?.canCheckout || Boolean(changedQuote)
              }
              className="storefront-primary-action flex-1"
            >
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Confirmando…
                </>
              ) : (
                `Confirmar · ${formatCurrency(effectiveQuote?.total ?? 0)}`
              )}
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}

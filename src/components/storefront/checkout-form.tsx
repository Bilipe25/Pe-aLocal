'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  AlertTriangle,
  Banknote,
  Bike,
  Check,
  CreditCard,
  Loader2,
  MapPin,
  QrCode,
  ReceiptText,
  Store,
  UserRound,
} from 'lucide-react';
import dynamic from 'next/dynamic';
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
  object,
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
import {
  reportCheckoutAbandonment,
  reportCheckoutConversionEvent,
  reportCheckoutEvent,
} from '@/lib/checkout/telemetry';
import {
  MERCADO_PAGO_SANDBOX_PIX_AMOUNT_CENTS,
  MERCADO_PAGO_SANDBOX_PIX_AMOUNT_MESSAGE,
  MERCADO_PAGO_SANDBOX_PIX_EMAIL_MESSAGE,
  MERCADO_PAGO_SANDBOX_PIX_PAYER_EMAIL,
} from '@/lib/mercado-pago/sandbox';
import {
  clearCheckoutIdempotency,
  resolveCheckoutIdempotency,
  type CheckoutIdempotencyRecord,
} from '@/lib/orders/checkout-idempotency';
import { storePaymentReportToken } from '@/lib/orders/payment-report-token-memory';
import { cn, formatCurrency } from '@/lib/utils';
import type { CheckoutQuoteInput } from '@/schemas/checkout';
import { selectCartCouponCode, subscribeToCartStorage, useCartStore } from '@/stores/cart-store';
import { usePublicOrderHistoryStore } from '@/stores/public-order-history-store';
import type {
  CustomerRecognitionConfirmationResult,
  CustomerRecognitionResult,
  MaskedCustomerAddressDto,
} from '@/types/customer-recognition';
import type {
  CheckoutQuoteDto,
  PublicCheckoutPaymentConfig,
  PublicDeliveryZoneDto,
} from '@/types/storefront';

export function preloadCustomerRecognitionDialog() {
  return import('@/components/storefront/customer-recognition-dialog');
}

const CustomerRecognitionDialog = dynamic(
  () => preloadCustomerRecognitionDialog().then((module) => module.CustomerRecognitionDialog),
  { ssr: false },
);

export interface AutomaticRecognitionBootstrap {
  storeSlug: string;
  request: Promise<unknown>;
}

const checkoutFormSchema = object({
  identityMode: enumSchema(['VISITOR', 'RECOGNIZED']),
  customerName: string().check(trim(), maxLength(100)),
  customerPhone: string().check(trim(), maxLength(20)),
  modality: enumSchema(['DELIVERY', 'PICKUP']),
  deliveryZoneId: string().check(maxLength(100)),
  deliveryPostalCode: string().check(maxLength(9)),
  savedAddressReference: string().check(maxLength(128)),
  address: object({
    street: string().check(trim(), maxLength(160)),
    number: string().check(trim(), maxLength(30)),
    complement: string().check(trim(), maxLength(120, 'Use no máximo 120 caracteres.')),
    reference: string().check(trim(), maxLength(200, 'Use no máximo 200 caracteres.')),
  }),
  saveCustomerData: boolean(),
  addressLabel: enumSchema(['HOME', 'WORK', 'OTHER']),
  setAddressAsDefault: boolean(),
  paymentMethod: enumSchema(['PIX', 'CASH', 'CARD_ON_DELIVERY']),
  onlinePayment: boolean(),
  onlineSandbox: boolean(),
  payerEmail: string().check(trim(), maxLength(254)),
  cashWithoutChange: boolean(),
  changeFor: string().check(maxLength(20)),
  couponCode: string().check(trim(), maxLength(32)),
  notes: string().check(trim(), maxLength(500, 'Use no máximo 500 caracteres.')),
}).check(
  superRefine((data, ctx) => {
    if (data.identityMode === 'VISITOR') {
      if (data.customerName.length < 2) {
        ctx.addIssue({
          code: 'custom',
          path: ['customerName'],
          message: 'Informe seu nome.',
          input: data.customerName,
        });
      }
      if (!validateBrazilianPhone(data.customerPhone)) {
        ctx.addIssue({
          code: 'custom',
          path: ['customerPhone'],
          message: 'Informe um telefone brasileiro válido.',
          input: data.customerPhone,
        });
      }
    }
    if (data.modality === 'DELIVERY') {
      if (data.deliveryPostalCode && !/^\d{5}-?\d{3}$/.test(data.deliveryPostalCode)) {
        ctx.addIssue({
          code: 'custom',
          path: ['deliveryPostalCode'],
          message: 'Se informar o CEP, use 8 números.',
          input: data.deliveryPostalCode,
        });
      }
      if (!data.deliveryZoneId && !data.savedAddressReference) {
        ctx.addIssue({
          code: 'custom',
          path: ['deliveryZoneId'],
          message: 'Escolha uma região atendida.',
          input: data.deliveryZoneId,
        });
      }
      if (!data.savedAddressReference) {
        const requiredAddressFields = [
          ['street', 'Informe a rua.'],
          ['number', 'Informe o número.'],
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
      }
    }
    if (!data.saveCustomerData && data.setAddressAsDefault) {
      ctx.addIssue({
        code: 'custom',
        path: ['setAddressAsDefault'],
        message: 'Ative o salvamento dos dados para definir um endereço principal.',
        input: data.setAddressAsDefault,
      });
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
    const onlinePixSelected = data.onlinePayment && data.paymentMethod === 'PIX';
    if (onlinePixSelected && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(data.payerEmail.trim())) {
      ctx.addIssue({
        code: 'custom',
        path: ['payerEmail'],
        message: 'Informe um e-mail válido para gerar o Pix.',
        input: data.payerEmail,
      });
    }
    if (
      onlinePixSelected &&
      data.onlineSandbox &&
      data.payerEmail.trim().toLowerCase() !== MERCADO_PAGO_SANDBOX_PIX_PAYER_EMAIL
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['payerEmail'],
        message: MERCADO_PAGO_SANDBOX_PIX_EMAIL_MESSAGE,
        input: data.payerEmail,
      });
    }
  }),
);

type CheckoutFormValues = Infer<typeof checkoutFormSchema>;
type CheckoutStep = 'identification' | 'fulfillment' | 'payment' | 'review';
type RecognizedCustomer = Extract<CustomerRecognitionResult, { recognized: true }>;
type RecognitionAction = 'confirm' | 'new-address' | 'not-me' | 'forget';

export interface CheckoutFormProps {
  storeId: string;
  storeSlug: string;
  minOrderValue: number;
  deliveryEnabled: boolean;
  pickupEnabled: boolean;
  paymentConfig: PublicCheckoutPaymentConfig;
  initialStep?: CheckoutStep;
  initialModality?: 'DELIVERY' | 'PICKUP';
  initialCouponCode?: string;
  deliveryZones?: PublicDeliveryZoneDto[];
  storeCity?: string;
  storeState?: string;
  automaticRecognitionManaged?: boolean;
  automaticRecognitionBootstrap?: AutomaticRecognitionBootstrap | null;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isMaskedAddress(value: unknown): value is MaskedCustomerAddressDto {
  return (
    isRecord(value) &&
    typeof value.opaqueReference === 'string' &&
    typeof value.label === 'string' &&
    typeof value.maskedAddress === 'string' &&
    typeof value.isDefault === 'boolean' &&
    typeof value.requiresDeliveryZoneSelection === 'boolean' &&
    (value.lastUsedLabel === undefined || typeof value.lastUsedLabel === 'string')
  );
}

function isRecognitionResult(value: unknown): value is CustomerRecognitionResult {
  if (!isRecord(value) || typeof value.recognized !== 'boolean') return false;
  if (!value.recognized) {
    return (
      typeof value.message === 'string' &&
      (value.recognitionUnavailable === undefined ||
        typeof value.recognitionUnavailable === 'boolean') &&
      (value.retryAfterSeconds === undefined || typeof value.retryAfterSeconds === 'number')
    );
  }
  return (
    typeof value.maskedName === 'string' &&
    typeof value.maskedPhone === 'string' &&
    Array.isArray(value.maskedAddresses) &&
    value.maskedAddresses.length <= 5 &&
    value.maskedAddresses.every(isMaskedAddress)
  );
}

function isRecognitionConfirmation(value: unknown): value is CustomerRecognitionConfirmationResult {
  return (
    isRecord(value) &&
    value.confirmed === true &&
    (value.mode === 'NEW_ADDRESS' ||
      (value.mode === 'SAVED_ADDRESS' && typeof value.opaqueReference === 'string'))
  );
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
    <div className="storefront-checkout-summary rounded-2xl p-4">
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
  paymentConfig,
  deliveryZones = [],
  storeCity = '',
  storeState = '',
  initialStep = 'identification',
  initialModality,
  initialCouponCode = '',
  automaticRecognitionManaged = false,
  automaticRecognitionBootstrap,
}: CheckoutFormProps) {
  const router = useRouter();
  const items = useCartStore((state) => state.items);
  const activeStoreId = useCartStore((state) => state.storeId);
  const setStore = useCartStore((state) => state.setStore);
  const clearCart = useCartStore((state) => state.clearCart);
  const getCartSnapshot = useCartStore((state) => state.getSnapshot);
  const cartCouponCode = useCartStore(selectCartCouponCode);
  const setCartCouponCode = useCartStore((state) => state.setCouponCode);
  const rememberOrder = usePublicOrderHistoryStore((state) => state.rememberOrder);
  const [step, setStepState] = useState<CheckoutStep>(initialStep);
  const [isPending, startTransition] = useTransition();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [orderConfirmed, setOrderConfirmed] = useState<{
    orderNumber: number;
    token: string;
    onlinePaymentState: 'READY' | 'PENDING' | null;
  } | null>(null);
  const successNavTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [couponReviewError, setCouponReviewError] = useState<string | null>(null);
  const [changedQuote, setChangedQuote] = useState<CheckoutQuoteDto | null>(null);
  const [acceptedChangedQuote, setAcceptedChangedQuote] = useState<CheckoutQuoteDto | null>(null);
  const [recognizedCustomer, setRecognizedCustomer] = useState<RecognizedCustomer | null>(null);
  const [recognitionDialogOpen, setRecognitionDialogOpen] = useState(false);
  const [recognitionPending, setRecognitionPending] = useState(false);
  const [recognitionAction, setRecognitionAction] = useState<RecognitionAction | null>(null);
  const [recognitionError, setRecognitionError] = useState<string | null>(null);
  const [recognitionNotice, setRecognitionNotice] = useState<string | null>(null);
  const [selectedAddressReference, setSelectedAddressReference] = useState<string | null>(null);
  const [confirmedSavedAddress, setConfirmedSavedAddress] =
    useState<MaskedCustomerAddressDto | null>(null);
  const idempotencyRef = useRef<CheckoutIdempotencyRecord | null>(null);
  const recognitionTriggerRef = useRef<HTMLButtonElement>(null);
  const recognitionSessionActiveRef = useRef(false);
  const automaticRecognitionRequestRef = useRef<{
    storeId: string;
    request: Promise<CustomerRecognitionResult | null>;
  } | null>(null);
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
  const recognitionEndpoint = `/api/storefront/${encodeURIComponent(storeSlug)}/checkout/recognition`;
  const defaultModality =
    initialModality === 'DELIVERY' && canDeliver
      ? 'DELIVERY'
      : initialModality === 'PICKUP' && pickupEnabled
        ? 'PICKUP'
        : canDeliver
          ? 'DELIVERY'
          : 'PICKUP';
  const onlinePixMethod = paymentConfig.methods.find(
    (method) => method.method === 'PIX' && method.processing === 'ONLINE',
  );
  const onlinePayment = Boolean(onlinePixMethod);
  const onlineSandbox = onlinePixMethod?.environment === 'SANDBOX';
  const availablePaymentMethods = useMemo<Array<'PIX' | 'CASH' | 'CARD_ON_DELIVERY'>>(
    () =>
      paymentConfig.methods
        .map((method) => method.method)
        .filter(
          (method): method is 'PIX' | 'CASH' | 'CARD_ON_DELIVERY' =>
            method !== 'CARD_IN_PERSON',
        ),
    [paymentConfig.methods],
  );
  const defaultPayment = availablePaymentMethods[0] ?? 'PIX';

  const {
    control,
    register,
    handleSubmit,
    setValue,
    setError,
    setFocus,
    clearErrors,
    trigger,
    getValues,
    formState: { errors },
    reset,
  } = useForm<CheckoutFormValues>({
    resolver: zodResolver(checkoutFormSchema),
    mode: 'onBlur',
    defaultValues: {
      identityMode: 'VISITOR',
      customerName: '',
      customerPhone: '',
      modality: defaultModality,
      deliveryZoneId: '',
      deliveryPostalCode: '',
      savedAddressReference: '',
      address: {
        street: '',
        number: '',
        complement: '',
        reference: '',
      },
      saveCustomerData: true,
      addressLabel: 'HOME',
      setAddressAsDefault: false,
      paymentMethod: defaultPayment,
      onlinePayment,
      onlineSandbox,
      payerEmail: onlineSandbox ? MERCADO_PAGO_SANDBOX_PIX_PAYER_EMAIL : '',
      cashWithoutChange: true,
      changeFor: '',
      couponCode: initialCouponCode,
      notes: '',
    },
  });

  const [
    identityMode,
    modality,
    deliveryZoneId,
    deliveryPostalCode,
    savedAddressReference,
    saveCustomerData,
    paymentMethod,
    cashWithoutChange,
    couponCode,
  ] = useWatch({
    control,
    name: [
      'identityMode',
      'modality',
      'deliveryZoneId',
      'deliveryPostalCode',
      'savedAddressReference',
      'saveCustomerData',
      'paymentMethod',
      'cashWithoutChange',
      'couponCode',
    ],
  });
  const normalizedPostalCode = deliveryPostalCode.replace(/\D/g, '');
  const onlinePixSelected = onlinePayment && paymentMethod === 'PIX';
  const quoteInput = useMemo<CheckoutQuoteInput | null>(() => {
    if (activeStoreId !== storeId || items.length === 0) return null;
    if (modality === 'DELIVERY' && !deliveryZoneId && !savedAddressReference) {
      return null;
    }
    if (
      modality === 'DELIVERY' &&
      normalizedPostalCode.length > 0 &&
      normalizedPostalCode.length !== 8
    ) {
      return null;
    }
    return {
      modality,
      deliveryZoneId: modality === 'DELIVERY' && deliveryZoneId ? deliveryZoneId : undefined,
      deliveryPostalCode:
        modality === 'DELIVERY' && normalizedPostalCode ? normalizedPostalCode : undefined,
      savedAddressReference:
        modality === 'DELIVERY' && savedAddressReference ? savedAddressReference : undefined,
      couponCode: couponCode.trim() || undefined,
      items: items.map((item) => ({
        lineId: item.id,
        productId: item.productId,
        quantity: item.quantity,
        notes: item.notes,
        optionIds: item.selectedOptions.map((option) => option.id),
      })),
    };
  }, [
    activeStoreId,
    couponCode,
    deliveryZoneId,
    items,
    modality,
    normalizedPostalCode,
    savedAddressReference,
    storeId,
  ]);
  const {
    quote,
    error: quoteError,
    isLoading: quoteLoading,
    lastUpdatedAt,
    refetch: refetchQuote,
  } = useCheckoutQuote({ storeSlug, input: quoteInput });
  const effectiveQuote = acceptedChangedQuote ?? quote;
  const couponQuoteIssue =
    effectiveQuote?.issues.find((issue) => issue.code === 'COUPON_INVALID') ?? null;
  const couponCorrectionMessage = couponReviewError ?? couponQuoteIssue?.message ?? null;
  const selectedDeliveryZone = deliveryZones.find((zone) => zone.id === deliveryZoneId);
  const reviewValues = step === 'review' ? getValues() : null;

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
    if (step !== 'identification') return;

    const bootstrappedRequest =
      automaticRecognitionBootstrap?.storeSlug === storeSlug
        ? automaticRecognitionBootstrap.request
        : null;
    if (automaticRecognitionManaged && !bootstrappedRequest) return;
    if (
      !bootstrappedRequest &&
      (!automaticRecognitionRequestRef.current ||
        automaticRecognitionRequestRef.current.storeId !== storeId)
    ) {
      automaticRecognitionRequestRef.current = {
        storeId,
        request: fetch(recognitionEndpoint, {
          method: 'GET',
          cache: 'no-store',
        })
          .then(async (response) => {
            const body = (await response.json()) as unknown;
            return response.ok && isRecognitionResult(body) ? body : null;
          })
          .catch(() => null),
      };
    }

    const request = bootstrappedRequest
      ? bootstrappedRequest.then((body) => (isRecognitionResult(body) ? body : null))
      : automaticRecognitionRequestRef.current?.request;
    if (!request) return;

    let active = true;
    void request.then((body) => {
      if (!active || !body?.recognized) return;

      recognitionSessionActiveRef.current = true;
      setRecognizedCustomer(body);
      setRecognitionError(null);
      setRecognitionNotice(null);
      const preferredAddress =
        body.maskedAddresses.find((address) => address.isDefault) ?? body.maskedAddresses[0];
      setSelectedAddressReference(preferredAddress?.opaqueReference ?? null);
      setRecognitionDialogOpen(true);
    });

    return () => {
      active = false;
    };
  }, [
    automaticRecognitionBootstrap,
    automaticRecognitionManaged,
    recognitionEndpoint,
    step,
    storeId,
    storeSlug,
  ]);

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
      if (recognitionSessionActiveRef.current && !completedRef.current) {
        void fetch(recognitionEndpoint, {
          method: 'DELETE',
          cache: 'no-store',
          keepalive: true,
        }).catch(() => undefined);
      }
    };
  }, [recognitionEndpoint, storeSlug]);

  useEffect(() => {
    if (!orderConfirmed) return;
    successNavTimerRef.current = setTimeout(() => {
      router.push(`/${storeSlug}/order/${orderConfirmed.token}`);
    }, 800);
    return () => {
      if (successNavTimerRef.current) clearTimeout(successNavTimerRef.current);
    };
  }, [orderConfirmed, router, storeSlug]);

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
      modality: initialModality
        ? defaultModality
        : draft.modality === 'DELIVERY' && canDeliver
          ? 'DELIVERY'
          : draft.modality === 'PICKUP' && pickupEnabled
            ? 'PICKUP'
            : defaultModality,
      paymentMethod: availablePaymentMethods.includes(draft.paymentMethod)
        ? draft.paymentMethod
        : defaultPayment,
      deliveryZoneId:
        draft.deliveryZoneId && deliveryZones.some((zone) => zone.id === draft.deliveryZoneId)
          ? draft.deliveryZoneId
          : '',
      couponCode: initialCouponCode || cartCouponCode || '',
    }));
  }, [
    activeStoreId,
    availablePaymentMethods,
    canDeliver,
    cartCouponCode,
    defaultModality,
    defaultPayment,
    deliveryZones,
    initialCouponCode,
    initialModality,
    onlinePayment,
    pickupEnabled,
    reset,
    setValue,
    storeId,
  ]);

  useEffect(() => {
    if (!restoredRef.current || completedRef.current) return;
    const timer = window.setTimeout(() => {
      writeCheckoutDraft(getSessionStorage(), storeId, {
        step,
        modality,
        deliveryZoneId: deliveryZoneId || undefined,
        paymentMethod,
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [deliveryZoneId, modality, paymentMethod, step, storeId]);

  useEffect(() => {
    if (activeStoreId !== storeId || !restoredRef.current) return;
    const timer = window.setTimeout(() => {
      setCartCouponCode(couponCode);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [activeStoreId, couponCode, setCartCouponCode, storeId]);

  const quoteInputKey = useMemo(() => JSON.stringify(quoteInput), [quoteInput]);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setChangedQuote(null);
      setAcceptedChangedQuote(null);
      setSubmitError(null);
      setCouponReviewError(null);
    });
    return () => {
      active = false;
    };
  }, [quoteInputKey]);

  function setStep(nextStep: CheckoutStep) {
    setStepState(nextStep);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    const query = new URLSearchParams({ step: nextStep, modality });
    const normalizedCoupon = couponCode.trim().toUpperCase();
    if (normalizedCoupon) query.set('coupon', normalizedCoupon);
    window.history.replaceState(
      window.history.state,
      '',
      `/${storeSlug}/checkout?${query.toString()}`,
    );
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function requestRecognition() {
    setRecognitionPending(true);
    setRecognitionError(null);
    setRecognitionNotice(null);
    setRecognizedCustomer(null);
    setConfirmedSavedAddress(null);
    setSelectedAddressReference(null);
    setValue('savedAddressReference', '');
    setValue('identityMode', 'VISITOR', { shouldDirty: false });
    recognitionSessionActiveRef.current = true;

    try {
      const [customerPhone, customerName] = getValues(['customerPhone', 'customerName']);
      const response = await fetch(recognitionEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerPhone,
          customerName,
        }),
        cache: 'no-store',
      });
      const body = (await response.json()) as unknown;
      if (!isRecognitionResult(body)) {
        throw new Error('Resposta de reconhecimento inválida.');
      }

      if (!body.recognized) {
        setRecognitionNotice(body.message);
        setStep('fulfillment');
        return;
      }

      setRecognizedCustomer(body);
      if (body.maskedAddresses.length === 0) {
        await continueWithNewAddress(false);
        return;
      }

      const preferredAddress =
        body.maskedAddresses.find((address) => address.isDefault) ?? body.maskedAddresses[0];
      setSelectedAddressReference(preferredAddress.opaqueReference);
      setRecognitionDialogOpen(true);
    } catch {
      setRecognizedCustomer(null);
      setRecognitionNotice(
        'Não foi possível recuperar dados salvos. Você pode continuar preenchendo o checkout normalmente.',
      );
      setStep('fulfillment');
    } finally {
      setRecognitionPending(false);
    }
  }

  async function patchRecognition(body: Record<string, string>) {
    const response = await fetch(recognitionEndpoint, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const result = (await response.json()) as unknown;
    if (!response.ok || !isRecognitionConfirmation(result)) {
      throw new Error('Não foi possível confirmar os dados salvos.');
    }
    return result;
  }

  async function confirmSavedAddress() {
    if (!selectedAddressReference || !recognizedCustomer) return;
    setRecognitionAction('confirm');
    setRecognitionError(null);
    try {
      const confirmation = await patchRecognition({
        action: 'CONFIRM_ADDRESS',
        opaqueReference: selectedAddressReference,
      });
      if (confirmation.mode !== 'SAVED_ADDRESS') {
        throw new Error('A confirmação do endereço é inválida.');
      }
      const address = recognizedCustomer.maskedAddresses.find(
        (candidate) => candidate.opaqueReference === selectedAddressReference,
      );
      if (!address) throw new Error('O endereço escolhido não está mais disponível.');

      setConfirmedSavedAddress(address);
      setValue('identityMode', 'RECOGNIZED', { shouldDirty: false });
      setValue('savedAddressReference', confirmation.opaqueReference, { shouldDirty: true });
      if (!address.requiresDeliveryZoneSelection) {
        setValue('deliveryZoneId', '', { shouldDirty: true });
      }
      setRecognitionDialogOpen(false);
      setStep('fulfillment');
    } catch (error) {
      setRecognitionError(
        error instanceof Error
          ? error.message
          : 'Este endereço não está mais disponível. Informe um novo endereço.',
      );
    } finally {
      setRecognitionAction(null);
    }
  }

  async function continueWithNewAddress(showDialogError = true) {
    setRecognitionAction('new-address');
    setRecognitionError(null);
    let recognized = false;
    try {
      await patchRecognition({ action: 'USE_NEW_ADDRESS' });
      recognized = true;
    } catch {
      if (showDialogError) {
        setRecognitionNotice(
          'Não foi possível recuperar dados salvos. Você pode continuar preenchendo o checkout normalmente.',
        );
      }
    } finally {
      setConfirmedSavedAddress(null);
      setSelectedAddressReference(null);
      setValue('savedAddressReference', '', { shouldDirty: true });
      setValue('identityMode', recognized ? 'RECOGNIZED' : 'VISITOR', {
        shouldDirty: false,
      });
      setRecognitionDialogOpen(false);
      setRecognitionAction(null);
      setStep('fulfillment');
    }
  }

  async function rejectRecognizedCustomer(action: 'not-me' | 'forget' = 'not-me') {
    setRecognitionAction(action);
    setRecognitionError(null);
    try {
      await fetch(`${recognitionEndpoint}?forgetDevice=1`, {
        method: 'DELETE',
        cache: 'no-store',
      });
    } catch {
      // O checkout visitante continua seguro; a sessão expira no servidor.
    } finally {
      recognitionSessionActiveRef.current = false;
      setRecognizedCustomer(null);
      setConfirmedSavedAddress(null);
      setSelectedAddressReference(null);
      setValue('savedAddressReference', '', { shouldDirty: true });
      setValue('customerName', '', { shouldDirty: true });
      setValue('customerPhone', '', { shouldDirty: true });
      setValue('saveCustomerData', false, { shouldDirty: true });
      setValue('setAddressAsDefault', false, { shouldDirty: true });
      setValue('identityMode', 'VISITOR', { shouldDirty: false });
      setRecognitionDialogOpen(false);
      setRecognitionAction(null);
      setRecognitionNotice(
        'Reconhecimento removido desta loja. Informe seus dados para continuar.',
      );
      setStep('identification');
    }
  }

  async function forgetRecognizedCustomer() {
    await rejectRecognizedCustomer('forget');
  }

  function handleRecognitionDialogOpenChange(open: boolean) {
    setRecognitionDialogOpen(open);
  }

  async function goForward() {
    if (step === 'identification' && recognizedCustomer) {
      if (identityMode === 'VISITOR') {
        setRecognitionDialogOpen(true);
      } else {
        setStep('fulfillment');
      }
      return;
    }
    const fieldsByStep: Record<Exclude<CheckoutStep, 'review'>, FieldPath<CheckoutFormValues>[]> = {
      identification: ['customerPhone', 'customerName'],
      fulfillment: ['modality'],
      payment: [
        'paymentMethod',
        'cashWithoutChange',
        'changeFor',
        ...(onlinePixSelected ? (['payerEmail'] as FieldPath<CheckoutFormValues>[]) : []),
      ],
    };
    if (step === 'review') return;
    const baseFields =
      step === 'fulfillment' && modality === 'DELIVERY'
        ? ([
            'modality',
            'deliveryZoneId',
            'deliveryPostalCode',
            'savedAddressReference',
          ] as FieldPath<CheckoutFormValues>[])
        : fieldsByStep[step];
    const valid = await trigger(baseFields, { shouldFocus: true });
    if (!valid) return;
    if (
      step === 'payment' &&
      onlinePixSelected &&
      onlineSandbox &&
      effectiveQuote?.total !== MERCADO_PAGO_SANDBOX_PIX_AMOUNT_CENTS
    ) {
      setError('paymentMethod', { message: MERCADO_PAGO_SANDBOX_PIX_AMOUNT_MESSAGE });
      setFocusRequest({ field: 'paymentMethod' });
      return;
    }
    if (step === 'identification') {
      await requestRecognition();
      return;
    }
    if (step === 'fulfillment' && modality === 'DELIVERY') {
      let latestQuote = quote;
      const isQuoteFresh = lastUpdatedAt && Date.now() - lastUpdatedAt < 5000;
      const hasCoverageIssue = quote?.issues.some(
        (issue) => issue.code === 'OUTSIDE_DELIVERY_AREA',
      );

      if (!isQuoteFresh || hasCoverageIssue || !quote?.deliveryZoneId) {
        latestQuote = await refetchQuote();
      }

      if (!latestQuote) {
        setError('deliveryZoneId', {
          message:
            quoteError?.message ??
            'Não foi possível atualizar os valores da entrega agora. Aguarde um instante e tente novamente.',
        });
        return;
      }
      const coverageIssue = latestQuote.issues.find(
        (issue) => issue.code === 'OUTSIDE_DELIVERY_AREA',
      );
      if (coverageIssue || !latestQuote.deliveryZoneId) {
        setError('deliveryZoneId', {
          message:
            coverageIssue?.message ??
            'Não conseguimos confirmar a entrega para essa região. Escolha outra região ou fale com a loja.',
        });
        return;
      }
      clearErrors(['deliveryZoneId', 'deliveryPostalCode']);
      if (savedAddressReference) {
        const index = STEPS.findIndex((candidate) => candidate.id === step);
        setStep(STEPS[index + 1].id);
        return;
      }
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const addressValid = await trigger(
        [
          'address.street',
          'address.number',
          'address.complement',
          'address.reference',
          'addressLabel',
          'setAddressAsDefault',
        ],
        { shouldFocus: true },
      );
      if (!addressValid) return;
    }
    const index = STEPS.findIndex((candidate) => candidate.id === step);
    setStep(STEPS[index + 1].id);
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
    if (
      onlinePixSelected &&
      onlineSandbox &&
      effectiveQuote.total !== MERCADO_PAGO_SANDBOX_PIX_AMOUNT_CENTS
    ) {
      setError('paymentMethod', { message: MERCADO_PAGO_SANDBOX_PIX_AMOUNT_MESSAGE });
      setSubmitError(MERCADO_PAGO_SANDBOX_PIX_AMOUNT_MESSAGE);
      setStep('payment');
      setFocusRequest({ field: 'paymentMethod' });
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
        const commonPayload = {
          ...quoteInput!,
          deliveryAddress:
            validValues.modality === 'DELIVERY' && !validValues.savedAddressReference
              ? {
                  postalCode: normalizedPostalCode || undefined,
                  street: validValues.address.street,
                  number: validValues.address.number,
                  complement: validValues.address.complement,
                  reference: validValues.address.reference,
                }
              : undefined,
          saveCustomerData: validValues.saveCustomerData,
          addressLabel: validValues.addressLabel,
          setAddressAsDefault:
            validValues.saveCustomerData && !validValues.savedAddressReference
              ? validValues.setAddressAsDefault
              : false,
          paymentMethod: validValues.paymentMethod,
          payerEmail: onlinePixSelected ? validValues.payerEmail.trim() : undefined,
          changeFor,
          notes: validValues.notes,
          expectedQuoteFingerprint: effectiveQuote.quoteFingerprint,
        };
        const payload =
          identityMode === 'RECOGNIZED'
            ? {
                ...commonPayload,
                identityMode: 'RECOGNIZED' as const,
              }
            : {
                ...commonPayload,
                identityMode: 'VISITOR' as const,
                customerName: validValues.customerName,
                customerPhone: validValues.customerPhone,
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
            setError('deliveryZoneId', { message: result.error.message });
            setStep('fulfillment');
            return;
          }
          if (result.error.code === 'COUPON_INVALID') {
            setCouponReviewError(result.error.message);
            return;
          }
          const payerEmailIssue = result.error.details?.some(
            (detail) => detail.path === 'payerEmail',
          );
          if (payerEmailIssue || result.error.code === 'PAYMENT_CREATION_FAILED') {
            idempotencyRef.current = null;
            clearCheckoutIdempotency(storage, storageKey);
            if (payerEmailIssue) setError('payerEmail', { message: result.error.message });
            setSubmitError(result.error.message);
            setStep('payment');
            setFocusRequest({ field: payerEmailIssue ? 'payerEmail' : 'paymentMethod' });
            return;
          }
          setSubmitError(result.error.message);
          return;
        }

        completedRef.current = true;
        recognitionSessionActiveRef.current = false;
        if (!result.data.onlinePayment) {
          reportCheckoutEvent(storeSlug, { event: 'checkout_completed', step: 'review' });
        } else if (result.data.onlinePaymentState === 'READY') {
          reportCheckoutConversionEvent(storeSlug, result.data.publicToken, 'checkout_completed');
          reportCheckoutConversionEvent(storeSlug, result.data.publicToken, 'pix_created');
        }
        idempotencyRef.current = null;
        clearCheckoutIdempotency(storage, storageKey);
        clearCheckoutDraft(storage, storeId);
        if (result.data.paymentReportToken) {
          storePaymentReportToken(result.data.publicToken, result.data.paymentReportToken);
        }
        const orderCreatedAt = new Date().toISOString();
        const publicOrderRecord = {
          trackingToken: result.data.publicToken,
          storeId,
          storeSlug,
          createdAt: orderCreatedAt,
        };
        rememberOrder(publicOrderRecord);
        if (result.data.onlinePayment && storage) {
          try {
            storage.setItem(
              `online-order-cart:${result.data.publicToken}`,
              JSON.stringify({ storeId, snapshot: getCartSnapshot() }),
            );
          } catch {
            // O backup é uma conveniência local; o pedido confirmado não depende dele.
          }
        }
        clearCart();
        setOrderConfirmed({
          orderNumber: result.data.orderNumber,
          token: result.data.publicToken,
          onlinePaymentState: result.data.onlinePaymentState,
        });
      } catch {
        setSubmitError('Não foi possível enviar seu pedido agora. Seus dados foram preservados.');
      }
    });
  };

  const handleInvalidSubmit: SubmitErrorHandler<CheckoutFormValues> = (invalidFields) => {
    let targetStep: CheckoutStep = 'review';
    let targetField: FieldPath<CheckoutFormValues> = 'notes';
    if (identityMode === 'VISITOR' && (invalidFields.customerName || invalidFields.customerPhone)) {
      targetStep = 'identification';
      targetField = invalidFields.customerName ? 'customerName' : 'customerPhone';
    } else if (
      invalidFields.modality ||
      invalidFields.deliveryZoneId ||
      invalidFields.deliveryPostalCode ||
      invalidFields.savedAddressReference ||
      invalidFields.address
    ) {
      targetStep = 'fulfillment';
      targetField = invalidFields.deliveryZoneId
        ? 'deliveryZoneId'
        : invalidFields.deliveryPostalCode
          ? 'deliveryPostalCode'
          : invalidFields.address?.street
            ? 'address.street'
            : invalidFields.address?.number
              ? 'address.number'
              : invalidFields.address?.complement
                ? 'address.complement'
                : invalidFields.address?.reference
                  ? 'address.reference'
                  : 'modality';
    } else if (
      invalidFields.paymentMethod ||
      invalidFields.cashWithoutChange ||
      invalidFields.changeFor ||
      invalidFields.payerEmail
    ) {
      targetStep = 'payment';
      targetField = invalidFields.payerEmail
        ? 'payerEmail'
        : invalidFields.changeFor
          ? 'changeFor'
          : 'paymentMethod';
    } else if (invalidFields.saveCustomerData || invalidFields.setAddressAsDefault) {
      targetStep = 'review';
      targetField = invalidFields.setAddressAsDefault ? 'setAddressAsDefault' : 'saveCustomerData';
    } else if (invalidFields.notes) {
      targetField = 'notes';
    }
    setFocusRequest({ field: targetField });
    setStep(targetStep);
  };

  function handleFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    // A confirmação do pedido exige um gesto explícito no CTA da revisão.
    // Em etapas anteriores, Enter continua avançando e validando normalmente.
    if (step !== 'review') {
      void goForward();
    }
  }

  function confirmOrder() {
    if (step !== 'review' || isPending) return;
    void handleSubmit(handleValidSubmit, handleInvalidSubmit)();
  }

  if (activeStoreId !== storeId) {
    return (
      <p className="text-text-muted py-12 text-center text-sm" role="status">
        Carregando sua sacola…
      </p>
    );
  }

  if (items.length === 0 && !orderConfirmed) {
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
  const totalSuffix = effectiveQuote ? ` \u00b7 ${formatCurrency(effectiveQuote.total)}` : '';
  const nextLabel =
    step === 'identification'
      ? `Continuar${totalSuffix}`
      : step === 'fulfillment'
        ? `Continuar para pagamento${totalSuffix}`
        : `Revisar pedido${totalSuffix}`;

  return (
    <form className="storefront-checkout-form" onSubmit={handleFormSubmit} noValidate>
      <nav aria-label="Etapas do checkout" className="storefront-checkout-progress">
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
                      'mt-2 flex items-center gap-1 truncate text-xs font-semibold sm:text-sm',
                      active
                        ? 'text-tinta'
                        : complete
                          ? 'storefront-action-text'
                          : 'text-text-muted',
                    )}
                  >
                    {complete && (
                      <Check className="h-3 w-3 shrink-0 sm:h-3.5 sm:w-3.5" aria-hidden="true" />
                    )}
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
                <span className="storefront-checkout-section-icon flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
                  <UserRound className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <h1
                    id="identification-title"
                    className="font-display text-tinta text-xl font-bold"
                  >
                    Vamos identificar você
                  </h1>
                  <p className="text-text-muted mt-1 text-sm">
                    Informe seus dados para continuar. Se você já pediu nesta loja, podemos
                    recuperar seus endereços salvos.
                  </p>
                </div>
              </header>
              {recognizedCustomer ? (
                <div className="border-tinta/15 bg-papel rounded-2xl border p-4">
                  <p className="text-text-muted text-xs font-semibold tracking-wide uppercase">
                    Reconhecimento neste aparelho
                  </p>
                  <p className="text-tinta mt-1 font-bold">{recognizedCustomer.maskedName}</p>
                  <p className="text-text-muted mt-0.5 text-sm">{recognizedCustomer.maskedPhone}</p>
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    <Button
                      ref={recognitionTriggerRef}
                      type="button"
                      className="storefront-primary-action min-h-11"
                      onClick={() => setRecognitionDialogOpen(true)}
                    >
                      Continuar como {recognizedCustomer.maskedName}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="text-text-muted hover:text-tinta min-h-11"
                      disabled={recognitionAction !== null}
                      onClick={() => void forgetRecognizedCustomer()}
                    >
                      {recognitionAction === 'forget' ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      ) : null}
                      Esquecer neste aparelho
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label htmlFor="customerPhone" className="text-tinta text-sm font-semibold">
                      Celular
                    </label>
                    <Input
                      id="customerPhone"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      autoFocus
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
                  <p className="text-text-muted text-sm">
                    Já pediu aqui? Podemos recuperar seus endereços salvos com segurança.
                  </p>
                  <p className="sr-only" aria-live="polite">
                    {recognitionPending
                      ? 'Verificando dados salvos.'
                      : (recognitionNotice ?? recognitionError ?? '')}
                  </p>
                  {recognitionNotice ? (
                    <p className="border-info/20 bg-info-light text-tinta rounded-xl border p-3 text-sm">
                      {recognitionNotice}
                    </p>
                  ) : null}
                </div>
              )}
            </section>
          )}

          {step === 'fulfillment' && (
            <section aria-labelledby="fulfillment-title" className="space-y-6">
              <header className="flex items-start gap-3">
                <span className="storefront-checkout-section-icon flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
                  <MapPin className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <h1 id="fulfillment-title" className="font-display text-tinta text-xl font-bold">
                    Como quer receber?
                  </h1>
                  <p className="text-text-muted mt-1 text-sm">
                    Para entrega, escolha uma das regiões atendidas pela loja.
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
                    aria-pressed={modality === 'DELIVERY'}
                    className={cn(
                      'focus-visible:ring-pimenta flex min-h-14 items-center gap-3 rounded-xl border px-4 text-left text-sm font-semibold focus-visible:ring-2 focus-visible:outline-none',
                      modality === 'DELIVERY'
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
                    aria-pressed={modality === 'PICKUP'}
                    className={cn(
                      'focus-visible:ring-pimenta flex min-h-14 items-center gap-3 rounded-xl border px-4 text-left text-sm font-semibold focus-visible:ring-2 focus-visible:outline-none',
                      modality === 'PICKUP'
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

              {modality === 'DELIVERY' && (
                <div className="space-y-4">
                  {recognitionNotice ? (
                    <p className="border-info/20 bg-info-light text-tinta rounded-xl border p-3 text-sm">
                      {recognitionNotice}
                    </p>
                  ) : null}

                  {confirmedSavedAddress ? (
                    <div className="border-tinta/15 bg-papel rounded-xl border p-4">
                      <div className="flex items-start gap-3">
                        <MapPin
                          className="storefront-action-text mt-0.5 h-5 w-5 shrink-0"
                          aria-hidden="true"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-tinta text-sm font-bold">
                            {confirmedSavedAddress.label}
                          </p>
                          <p className="text-text-muted mt-1 text-sm text-pretty">
                            {confirmedSavedAddress.maskedAddress}
                          </p>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        className="storefront-link mt-2 w-full"
                        onClick={() => void continueWithNewAddress()}
                      >
                        Usar outro endereço
                      </Button>
                    </div>
                  ) : null}

                  {(!confirmedSavedAddress ||
                    confirmedSavedAddress.requiresDeliveryZoneSelection) && (
                    <div>
                      <label htmlFor="deliveryZoneId" className="text-tinta text-sm font-semibold">
                        Bairro ou região atendida
                      </label>
                      <select
                        id="deliveryZoneId"
                        className="border-tinta/15 bg-papel text-tinta focus-visible:ring-pimenta mt-1 min-h-11 w-full rounded-xl border px-3 text-sm focus-visible:ring-2 focus-visible:outline-none"
                        aria-invalid={Boolean(errors.deliveryZoneId)}
                        aria-describedby={
                          errors.deliveryZoneId
                            ? 'deliveryZoneId-help deliveryZoneId-error'
                            : 'deliveryZoneId-help'
                        }
                        {...register('deliveryZoneId', {
                          onChange: () => clearErrors('deliveryZoneId'),
                        })}
                      >
                        <option value="">Selecione uma região</option>
                        {deliveryZones.map((zone) => (
                          <option key={zone.id} value={zone.id}>
                            {zone.name} · {formatCurrency(zone.fee)}
                          </option>
                        ))}
                      </select>
                      <p id="deliveryZoneId-help" className="text-text-muted mt-1 text-sm">
                        A taxa, o pedido mínimo e o prazo serão confirmados pelo servidor.
                      </p>
                      <FieldError
                        id="deliveryZoneId-error"
                        message={errors.deliveryZoneId?.message}
                      />
                    </div>
                  )}

                  {quoteLoading && quoteInput ? (
                    <p className="text-text-muted flex items-center gap-2 text-sm" role="status">
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      Confirmando a região…
                    </p>
                  ) : null}
                  {quote?.issues.some((issue) => issue.code === 'OUTSIDE_DELIVERY_AREA') ? (
                    <div className="border-error/20 bg-error-light text-tinta rounded-xl border p-3 text-sm">
                      {
                        quote.issues.find((issue) => issue.code === 'OUTSIDE_DELIVERY_AREA')
                          ?.message
                      }
                    </div>
                  ) : null}
                  {quote?.deliveryZoneId ? (
                    <div className="border-success/25 bg-success-light text-tinta rounded-xl border p-3 text-sm">
                      <p className="font-semibold">Entrega disponível · {quote.deliveryZoneName}</p>
                      <p className="mt-1">
                        Taxa {formatCurrency(quote.deliveryFee)} · prazo confirmado na revisão
                      </p>
                    </div>
                  ) : null}

                  {!confirmedSavedAddress && deliveryZoneId ? (
                    <fieldset className="space-y-4 border-0 p-0">
                      <legend className="text-tinta text-base font-bold">
                        Endereço de entrega
                      </legend>
                      <div className="grid grid-cols-[minmax(0,1fr)_6.5rem] gap-3">
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
                            value={storeCity}
                            readOnly
                            aria-readonly="true"
                            className="border-tinta/15 bg-tinta/5 text-tinta mt-1"
                          />
                        </div>
                        <div>
                          <label htmlFor="state" className="text-tinta text-sm font-semibold">
                            UF
                          </label>
                          <Input
                            id="state"
                            value={storeState}
                            readOnly
                            aria-readonly="true"
                            className="border-tinta/15 bg-tinta/5 text-tinta mt-1 uppercase"
                          />
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
                      <div>
                        <label
                          htmlFor="deliveryPostalCode"
                          className="text-tinta text-sm font-semibold"
                        >
                          CEP <span className="text-text-muted font-normal">(opcional)</span>
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
                            errors.deliveryPostalCode ? 'deliveryPostalCode-error' : undefined
                          }
                          {...register('deliveryPostalCode', {
                            onChange: (event) =>
                              setValue('deliveryPostalCode', formatPostalCode(event.target.value), {
                                shouldDirty: true,
                                shouldValidate: true,
                              }),
                          })}
                        />
                        <FieldError
                          id="deliveryPostalCode-error"
                          message={errors.deliveryPostalCode?.message}
                        />
                      </div>

                      {saveCustomerData ? (
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div>
                            <label
                              htmlFor="addressLabel"
                              className="text-tinta text-sm font-semibold"
                            >
                              Salvar como
                            </label>
                            <select
                              id="addressLabel"
                              className="border-tinta/15 bg-papel text-tinta focus-visible:ring-pimenta mt-1 min-h-11 w-full rounded-xl border px-3 text-sm focus-visible:ring-2 focus-visible:outline-none"
                              {...register('addressLabel')}
                            >
                              <option value="HOME">Casa</option>
                              <option value="WORK">Trabalho</option>
                              <option value="OTHER">Outro</option>
                            </select>
                          </div>
                          <label className="text-tinta flex min-h-11 cursor-pointer items-center gap-3 self-end text-sm font-semibold">
                            <input
                              type="checkbox"
                              className="accent-pimenta h-5 w-5"
                              {...register('setAddressAsDefault')}
                            />
                            Tornar principal
                          </label>
                        </div>
                      ) : null}
                    </fieldset>
                  ) : null}
                </div>
              )}
            </section>
          )}

          {step === 'payment' && (
            <section aria-labelledby="payment-title" className="space-y-6">
              <header className="flex items-start gap-3">
                <span className="storefront-checkout-section-icon flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
                  <CreditCard className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <h1 id="payment-title" className="font-display text-tinta text-xl font-bold">
                    Como prefere pagar?
                  </h1>
                  <p className="text-text-muted mt-1 text-sm">
                    {onlinePayment
                      ? 'Escolha o Pix automático ou pague no recebimento.'
                      : 'O pagamento é combinado diretamente com o estabelecimento.'}
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
                {paymentConfig.methods.flatMap((configuredMethod) => {
                  if (configuredMethod.method === 'CARD_IN_PERSON') return [];
                  const method =
                    configuredMethod.method === 'PIX'
                      ? {
                          value: 'PIX' as const,
                          label:
                            configuredMethod.processing === 'ONLINE' ? 'Pix automático' : 'Pix',
                          description:
                            configuredMethod.processing === 'ONLINE'
                              ? 'Confirmação automática pelo Mercado Pago'
                              : 'Use a chave exibida após confirmar',
                          Icon: QrCode,
                          iconClass: 'text-cyan-700 bg-cyan-50',
                        }
                      : configuredMethod.method === 'CASH'
                        ? {
                            value: 'CASH' as const,
                            label: 'Dinheiro',
                            description: 'Informe se precisa de troco',
                            Icon: Banknote,
                            iconClass: 'text-emerald-700 bg-emerald-50',
                          }
                        : {
                            value: 'CARD_ON_DELIVERY' as const,
                            label: 'Cartão no recebimento',
                            description: 'Pague na maquininha ao receber',
                            Icon: CreditCard,
                            iconClass: 'text-amber-700 bg-amber-50',
                          };
                  return [
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
                          paymentMethod === method.value &&
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
                          <span className="text-tinta block text-sm font-bold">{method.label}</span>
                          <span className="text-text-muted mt-1 block text-sm">
                            {method.description}
                          </span>
                        </span>
                        {paymentMethod === method.value && (
                          <Check className="storefront-action-text h-5 w-5" aria-hidden="true" />
                        )}
                      </span>
                    </label>,
                  ];
                })}
              </div>
              <FieldError id="paymentMethod-error" message={errors.paymentMethod?.message} />

              {onlinePixSelected && (
                <div className="border-tinta/10 rounded-xl border p-4">
                  <label htmlFor="payerEmail" className="text-tinta text-sm font-semibold">
                    {onlineSandbox ? 'E-mail do teste Pix' : 'E-mail do comprador'}
                  </label>
                  <Input
                    id="payerEmail"
                    type="email"
                    autoComplete="email"
                    placeholder="voce@exemplo.com"
                    readOnly={onlineSandbox}
                    className="border-tinta/15 bg-papel focus-visible:ring-pimenta mt-1"
                    aria-invalid={Boolean(errors.payerEmail)}
                    aria-describedby={errors.payerEmail ? 'payerEmail-error' : 'payerEmail-help'}
                    {...register('payerEmail')}
                  />
                  <p id="payerEmail-help" className="text-text-muted mt-2 text-xs">
                    {onlineSandbox
                      ? 'Endereço predefinido pelo Mercado Pago para simular a aprovação.'
                      : 'Usado apenas para gerar esta cobrança. A confirmação é automática.'}
                  </p>
                  <FieldError id="payerEmail-error" message={errors.payerEmail?.message} />
                  {onlineSandbox && (
                    <div
                      className="border-warning/40 bg-warning-light text-tinta mt-4 rounded-xl border p-3"
                      role="note"
                    >
                      <div className="flex items-start gap-2">
                        <AlertTriangle
                          className="text-warning mt-0.5 h-4 w-4 shrink-0"
                          aria-hidden="true"
                        />
                        <div className="min-w-0 text-sm">
                          <p className="font-semibold">Teste Pix do Mercado Pago</p>
                          <p className="mt-1">
                            O sandbox só gera o Pix quando o total do pedido é exatamente{' '}
                            <strong>R$ 50,00</strong>.
                          </p>
                          {!effectiveQuote ? (
                            <p className="mt-2">Atualizando o total do pedido…</p>
                          ) : effectiveQuote.total !== MERCADO_PAGO_SANDBOX_PIX_AMOUNT_CENTS ? (
                            <p className="mt-2">
                              Este pedido está em{' '}
                              <strong>{formatCurrency(effectiveQuote.total)}</strong>. Ajuste a
                              sacola ou escolha dinheiro ou cartão no recebimento.
                            </p>
                          ) : (
                            <p className="mt-2">
                              Total atual: <strong>{formatCurrency(effectiveQuote.total)}</strong>.
                              O pedido está pronto para o teste Pix.
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {paymentMethod === 'CASH' && (
                <div className="border-tinta/10 rounded-xl border p-4">
                  <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-semibold">
                    <input
                      type="checkbox"
                      className="accent-pimenta h-5 w-5"
                      {...register('cashWithoutChange')}
                    />
                    Sem troco
                  </label>
                  {!cashWithoutChange && (
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
              {effectiveQuote && (
                <div className="lg:hidden">
                  <QuoteSummary quote={effectiveQuote} />
                </div>
              )}
            </section>
          )}

          {step === 'review' && (
            <section aria-labelledby="review-title" className="space-y-6">
              <header className="flex items-start gap-3">
                <span className="storefront-checkout-section-icon flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
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

              {couponCorrectionMessage && (
                <div
                  className="border-error/20 bg-error-light text-tinta rounded-xl border p-4 text-sm"
                  role="alert"
                >
                  <p className="font-semibold">O cupom precisa ser corrigido na sacola.</p>
                  <p className="text-text-muted mt-1">{couponCorrectionMessage}</p>
                  <Button asChild variant="outline" className="mt-3 min-h-11">
                    <Link href={`/${storeSlug}/cart`}>Corrigir na sacola</Link>
                  </Button>
                </div>
              )}

              <div className="border-tinta/10 bg-papel divide-tinta/10 divide-y rounded-2xl border">
                <div className="flex items-start justify-between gap-4 p-4">
                  <div>
                    <p className="text-text-muted text-xs font-semibold tracking-wide uppercase">
                      Cliente
                    </p>
                    <p className="text-tinta mt-1 font-semibold">
                      {identityMode === 'RECOGNIZED'
                        ? recognizedCustomer?.maskedName
                        : reviewValues?.customerName}
                    </p>
                    <p className="text-text-muted text-sm">
                      {identityMode === 'RECOGNIZED'
                        ? recognizedCustomer?.maskedPhone
                        : reviewValues?.customerPhone}
                    </p>
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
                      {modality === 'DELIVERY' ? 'Entrega' : 'Retirada no local'}
                    </p>
                    {modality === 'DELIVERY' && (
                      <p className="text-text-muted mt-1 text-sm">
                        {confirmedSavedAddress
                          ? confirmedSavedAddress.maskedAddress
                          : `${reviewValues?.address.street ?? ''}, ${reviewValues?.address.number ?? ''} · ${selectedDeliveryZone?.name ?? 'Região selecionada'}`}
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
                      {paymentMethod === 'PIX'
                        ? onlinePixSelected
                          ? 'Pix automático'
                          : 'Pix'
                        : paymentMethod === 'CASH'
                          ? 'Dinheiro'
                          : 'Cartão no recebimento'}
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

              <div className="border-tinta/15 bg-papel rounded-xl border p-4">
                <label className="text-tinta flex min-h-11 cursor-pointer items-start gap-3 text-sm font-semibold">
                  <input
                    type="checkbox"
                    className="accent-pimenta mt-0.5 h-5 w-5 shrink-0"
                    aria-describedby="save-customer-data-help"
                    {...register('saveCustomerData', {
                      onChange: (event) => {
                        if (!event.target.checked) {
                          setValue('setAddressAsDefault', false, { shouldDirty: true });
                        }
                      },
                    })}
                  />
                  <span>Salvar meus dados para a próxima compra</span>
                </label>
                <p
                  id="save-customer-data-help"
                  className="text-text-muted mt-2 text-sm text-pretty"
                >
                  Podemos salvar seu nome, celular e endereço para facilitar suas próximas compras
                  nesta loja. Isso é reconhecimento rápido, não uma conta autenticada.
                </p>
                <FieldError
                  id="saveCustomerData-error"
                  message={errors.saveCustomerData?.message ?? errors.setAddressAsDefault?.message}
                />
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
                {modality === 'DELIVERY'
                  ? 'Escolha uma região para calcular a entrega.'
                  : 'Atualizando valores…'}
              </p>
            </div>
          )}
        </aside>
      </div>

      <div className="storefront-checkout-action-bar purchase-step-action fixed inset-x-0 bottom-0 z-40 border-t px-4 pt-3 backdrop-blur lg:static lg:mt-8 lg:border-0 lg:bg-transparent lg:px-0 lg:pt-0">
        <div className="mx-auto max-w-5xl">
          {step !== 'review' ? (
            <Button
              ref={step === 'identification' ? recognitionTriggerRef : undefined}
              type="button"
              onClick={() => void goForward()}
              disabled={recognitionPending}
              className="storefront-primary-action w-full overflow-hidden px-3 text-sm text-ellipsis sm:px-4"
            >
              {step === 'identification' && recognitionPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Verificando…
                </>
              ) : (
                nextLabel
              )}
            </Button>
          ) : (
            <Button
              type="button"
              onClick={confirmOrder}
              disabled={
                isPending || quoteLoading || !effectiveQuote?.canCheckout || Boolean(changedQuote)
              }
              className="storefront-primary-action w-full overflow-hidden px-3 text-sm text-ellipsis sm:px-4"
            >
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  {onlinePixSelected ? 'Gerando Pix…' : 'Enviando…'}
                </>
              ) : (
                `Confirmar · ${formatCurrency(effectiveQuote?.total ?? 0)}`
              )}
            </Button>
          )}
        </div>
      </div>

      {recognizedCustomer ? (
        <CustomerRecognitionDialog
          open={recognitionDialogOpen}
          customer={recognizedCustomer}
          selectedReference={selectedAddressReference}
          pendingAction={recognitionAction}
          error={recognitionError}
          returnFocusRef={recognitionTriggerRef}
          onOpenChange={handleRecognitionDialogOpenChange}
          onSelectAddress={setSelectedAddressReference}
          onConfirm={() => void confirmSavedAddress()}
          onUseNewAddress={() => void continueWithNewAddress()}
          onNotMe={() => void rejectRecognizedCustomer()}
          onForget={() => void forgetRecognizedCustomer()}
        />
      ) : null}

      {orderConfirmed && (
        <div
          className="checkout-success-overlay"
          role="status"
          aria-live="assertive"
          aria-atomic="true"
        >
          <svg className="checkout-success-check" viewBox="0 0 36 36" aria-hidden="true">
            <circle className="check-circle" cx="18" cy="18" r="16" />
            <polyline className="check-mark" points="11,18 16,23 25,13" />
          </svg>
          <p className="checkout-success-title">
            {orderConfirmed.onlinePaymentState === 'READY'
              ? `Pix do pedido #${orderConfirmed.orderNumber} gerado!`
              : orderConfirmed.onlinePaymentState === 'PENDING'
                ? `Pedido #${orderConfirmed.orderNumber} criado. Gerando o Pix…`
                : `Pedido #${orderConfirmed.orderNumber} enviado!`}
          </p>
        </div>
      )}
    </form>
  );
}

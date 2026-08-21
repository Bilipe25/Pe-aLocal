'use client';

import * as Dialog from '@radix-ui/react-dialog';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  BadgePercent,
  Check,
  ChevronRight,
  Clock3,
  CirclePlus,
  Loader2,
  Maximize2,
  Minus,
  PackageOpen,
  Plus,
  Search,
  Settings2,
  Star,
  ShoppingBag,
  Trash2,
  Truck,
  UserRoundSearch,
  Utensils,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { formatCurrency } from '@/lib/utils';
import type {
  PosDraftIntentInput,
  PosManualDiscountInput,
  PosOrderInput,
  PosQuoteInput,
} from '@/schemas/pos';
import type { getPosWorkspace } from '@/server/services/pos-order.service';
import type { CheckoutQuoteDto } from '@/types/storefront';
import { cn } from '@/lib/utils';

import {
  createPosOrderAction,
  createPosShortcutAction,
  deactivatePosTerminalAction,
  deletePosShortcutAction,
  discardPosDraftAction,
  listOpenPosDraftsAction,
  lookupPosCustomerAction,
  quotePosOrderAction,
  repeatPosOrderAction,
  reorderPosShortcutsAction,
  resumePosDraftAction,
  savePosDraftAction,
  savePosTerminalAction,
} from '../actions';

type Workspace = Awaited<ReturnType<typeof getPosWorkspace>>;
type Product = Workspace['products'][number];
type Offer = Workspace['offers'][number];
type CartInput = PosQuoteInput['items'][number];
type CartLine = CartInput & { label: string; displayPrice: number };
interface CustomerLookup {
  id: string;
  name: string;
  phone: string;
  addresses: Array<{
    id: string;
    label: 'HOME' | 'WORK' | 'OTHER';
    street: string;
    number: string;
    complement: string | null;
    neighborhood: string;
    city: string;
    state: string;
    zipCode: string | null;
    reference: string | null;
    deliveryZoneId: string | null;
  }>;
}

interface PosQuoteData {
  quote: CheckoutQuoteDto;
  availabilityWarning: string | null;
}

interface PosDraftSummary {
  id: string;
  version: number;
  modality: 'DELIVERY' | 'PICKUP' | 'DINE_IN';
  customerName: string;
  itemCount: number;
  expiresAt: Date;
  updatedAt: Date;
  createdByName: string;
  terminal: { id: string; name: string; isActive: boolean } | null;
}

const EMPTY_ADDRESS = {
  customerAddressId: undefined as string | undefined,
  deliveryZoneId: '',
  postalCode: '',
  street: '',
  number: '',
  complement: '',
  neighborhood: '',
  city: '',
  state: '',
  reference: '',
  label: 'OTHER' as 'HOME' | 'WORK' | 'OTHER',
};

function stripCartMetadata(lines: CartLine[]): PosQuoteInput['items'] {
  return lines.map(({ label, displayPrice, ...line }) => {
    void label;
    void displayPrice;
    return line;
  });
}

function normalizeSearch(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .trim();
}

function parseCurrencyToCents(value: string) {
  const normalized = value
    .trim()
    .replace(/\./g, '')
    .replace(',', '.')
    .replace(/[^\d.-]/g, '');
  if (!normalized) return undefined;
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) : undefined;
}

function parsePercentageToBasisPoints(value: string) {
  const amount = Number(value.trim().replace(',', '.'));
  return Number.isFinite(amount) && amount > 0 && amount <= 100
    ? Math.round(amount * 100)
    : undefined;
}

function ProductDialog({
  product,
  open,
  onOpenChange,
  onAdd,
}: {
  product: Product | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (line: CartLine) => void;
}) {
  const [quantity, setQuantity] = useState(1);
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [notes, setNotes] = useState('');

  if (!product) return null;
  const valid = product.optionGroups.every((group) => {
    const count = selected[group.id]?.length ?? 0;
    return count >= group.minSelections && count <= group.maxSelections;
  });
  const optionIds = product.optionGroups.flatMap((group) => selected[group.id] ?? []);
  const optionPrice = product.optionGroups
    .flatMap((group) => group.options)
    .filter((option) => optionIds.includes(option.id))
    .reduce((sum, option) => sum + option.price, 0);

  function toggleOption(group: Product['optionGroups'][number], optionId: string) {
    setSelected((current) => {
      const values = current[group.id] ?? [];
      if (values.includes(optionId)) {
        return { ...current, [group.id]: values.filter((id) => id !== optionId) };
      }
      const next = group.isMultiple
        ? [...values, optionId].slice(-group.maxSelections)
        : [optionId];
      return { ...current, [group.id]: next };
    });
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="bg-tinta/55 fixed inset-0 z-50" />
        <Dialog.Content className="bg-surface fixed inset-x-3 top-1/2 z-50 max-h-[90dvh] -translate-y-1/2 overflow-y-auto rounded-2xl p-5 shadow-xl sm:inset-x-auto sm:left-1/2 sm:w-[38rem] sm:-translate-x-1/2">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="text-text-primary text-xl font-bold">
                {product.name}
              </Dialog.Title>
              <Dialog.Description className="text-text-secondary mt-1 text-sm">
                Configure somente o necessário antes de adicionar ao pedido.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Fechar configuração do produto">
                <X aria-hidden="true" />
              </Button>
            </Dialog.Close>
          </div>

          <div className="mt-5 space-y-5">
            {product.optionGroups.map((group) => (
              <fieldset key={group.id}>
                <legend className="text-text-primary font-semibold">
                  {group.title}
                  <span className="text-text-secondary ml-2 text-xs font-medium">
                    {group.minSelections > 0
                      ? `Escolha ${group.minSelections}${group.maxSelections > group.minSelections ? ` a ${group.maxSelections}` : ''}`
                      : `Até ${group.maxSelections}`}
                  </span>
                </legend>
                {group.description ? (
                  <p className="text-text-secondary mt-1 text-sm">{group.description}</p>
                ) : null}
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {group.options.map((option) => {
                    const checked = selected[group.id]?.includes(option.id) ?? false;
                    return (
                      <label
                        key={option.id}
                        className={cn(
                          'border-border flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-xl border px-3 py-2 text-sm transition-colors',
                          checked && 'border-brand-500 bg-brand-50',
                        )}
                      >
                        <span className="flex items-center gap-2">
                          <input
                            type={group.isMultiple ? 'checkbox' : 'radio'}
                            name={`option-${group.id}`}
                            checked={checked}
                            onChange={() => toggleOption(group, option.id)}
                            className="accent-brand-600 h-4 w-4"
                          />
                          {option.name}
                        </span>
                        {option.price > 0 ? (
                          <span className="font-mono text-xs">+{formatCurrency(option.price)}</span>
                        ) : null}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            ))}

            {product.allowNotes ? (
              <label className="block text-sm font-semibold">
                Observação
                <Textarea
                  className="mt-2"
                  maxLength={500}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Ex.: sem cebola"
                />
              </label>
            ) : null}

            <div className="flex items-center justify-between gap-4">
              <div className="border-border flex items-center rounded-xl border">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Diminuir quantidade"
                  onClick={() => setQuantity((value) => Math.max(1, value - 1))}
                >
                  <Minus aria-hidden="true" />
                </Button>
                <span className="w-10 text-center font-mono font-bold">{quantity}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Aumentar quantidade"
                  onClick={() => setQuantity((value) => Math.min(99, value + 1))}
                >
                  <Plus aria-hidden="true" />
                </Button>
              </div>
              <Button
                size="lg"
                disabled={!valid}
                onClick={() => {
                  onAdd({
                    kind: 'PRODUCT',
                    lineId: crypto.randomUUID(),
                    productId: product.id,
                    quantity,
                    notes,
                    optionIds,
                    label: product.name,
                    displayPrice: product.basePrice + optionPrice,
                  });
                  onOpenChange(false);
                }}
              >
                Adicionar · {formatCurrency((product.basePrice + optionPrice) * quantity)}
              </Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function OfferDialog({
  offer,
  open,
  onOpenChange,
  onAdd,
}: {
  offer: Offer | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (line: CartLine) => void;
}) {
  const [choices, setChoices] = useState<Record<string, string>>(() =>
    offer?.kind === 'FLEXIBLE_COMBO'
      ? Object.fromEntries(offer.groups.map((group) => [group.groupId, group.choices[0]?.choiceId]))
      : {},
  );
  const [options, setOptions] = useState<Record<string, string[]>>({});

  if (!offer || offer.kind === 'PRODUCT_PROMOTION') return null;
  const components =
    offer.kind === 'COMBO'
      ? offer.components
      : offer.groups.flatMap((group) => {
          const selectedChoice = group.choices.find(
            (choice) => choice.choiceId === choices[group.groupId],
          );
          return selectedChoice
            ? [
                {
                  comboItemId: selectedChoice.choiceId,
                  quantity: group.quantity,
                  product: selectedChoice.product,
                },
              ]
            : [];
        });
  const valid =
    components.length >= 2 &&
    components.every((component) =>
      component.product.optionGroups.every((group) => {
        const count = options[`${component.comboItemId}:${group.id}`]?.length ?? 0;
        return count >= group.minSelections && count <= group.maxSelections;
      }),
    );

  function toggle(componentId: string, group: Product['optionGroups'][number], optionId: string) {
    const key = `${componentId}:${group.id}`;
    setOptions((current) => {
      const values = current[key] ?? [];
      if (values.includes(optionId)) {
        return { ...current, [key]: values.filter((id) => id !== optionId) };
      }
      return {
        ...current,
        [key]: group.isMultiple ? [...values, optionId].slice(-group.maxSelections) : [optionId],
      };
    });
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="bg-tinta/55 fixed inset-0 z-50" />
        <Dialog.Content className="bg-surface fixed inset-x-3 top-1/2 z-50 max-h-[92dvh] -translate-y-1/2 overflow-y-auto rounded-2xl p-5 shadow-xl sm:inset-x-auto sm:left-1/2 sm:w-[42rem] sm:-translate-x-1/2">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="text-xl font-bold">{offer.name}</Dialog.Title>
              <Dialog.Description className="text-text-secondary mt-1 text-sm">
                Monte o combo com as opções disponíveis.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Fechar configuração do combo">
                <X aria-hidden="true" />
              </Button>
            </Dialog.Close>
          </div>

          {offer.kind === 'FLEXIBLE_COMBO' ? (
            <div className="mt-5 space-y-4">
              {offer.groups.map((group) => (
                <fieldset key={group.groupId}>
                  <legend className="font-semibold">
                    {group.name} · {group.quantity}×
                  </legend>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {group.choices.map((choice) => (
                      <label
                        key={choice.choiceId}
                        className="border-border flex min-h-12 cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm"
                      >
                        <input
                          type="radio"
                          name={`combo-group-${group.groupId}`}
                          checked={choices[group.groupId] === choice.choiceId}
                          onChange={() =>
                            setChoices((current) => ({
                              ...current,
                              [group.groupId]: choice.choiceId,
                            }))
                          }
                          className="accent-brand-600"
                        />
                        <span className="flex-1">{choice.product.name}</span>
                        {choice.priceDelta > 0 ? (
                          <span className="font-mono text-xs">
                            +{formatCurrency(choice.priceDelta)}
                          </span>
                        ) : null}
                      </label>
                    ))}
                  </div>
                </fieldset>
              ))}
            </div>
          ) : null}

          <div className="mt-5 space-y-5">
            {components.map((component) => (
              <section key={component.comboItemId} className="border-border rounded-xl border p-3">
                <h3 className="font-semibold">
                  {component.quantity}× {component.product.name}
                </h3>
                {component.product.optionGroups.map((group) => {
                  const key = `${component.comboItemId}:${group.id}`;
                  return (
                    <fieldset key={group.id} className="mt-3">
                      <legend className="text-sm font-semibold">{group.title}</legend>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {group.options.map((option) => {
                          const checked = options[key]?.includes(option.id) ?? false;
                          return (
                            <label
                              key={option.id}
                              className={cn(
                                'border-border flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm',
                                checked && 'border-brand-500 bg-brand-50',
                              )}
                            >
                              <input
                                type={group.isMultiple ? 'checkbox' : 'radio'}
                                name={`combo-${key}`}
                                checked={checked}
                                onChange={() => toggle(component.comboItemId, group, option.id)}
                                className="accent-brand-600"
                              />
                              {option.name}
                            </label>
                          );
                        })}
                      </div>
                    </fieldset>
                  );
                })}
              </section>
            ))}
          </div>

          <Button
            className="mt-5 w-full"
            size="lg"
            disabled={!valid}
            onClick={() => {
              onAdd({
                kind: 'COMBO',
                lineId: crypto.randomUUID(),
                comboId: offer.id,
                quantity: 1,
                components: components.map((component) => ({
                  comboItemId: component.comboItemId,
                  notes: '',
                  optionIds: component.product.optionGroups.flatMap(
                    (group) => options[`${component.comboItemId}:${group.id}`] ?? [],
                  ),
                })),
                label: offer.name,
                displayPrice: offer.offerPrice,
              });
              onOpenChange(false);
            }}
          >
            Adicionar combo · {formatCurrency(offer.offerPrice)}
          </Button>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function PosWorkspace({ initialData }: { initialData: Workspace }) {
  const [modality, setModality] = useState<'PICKUP' | 'DELIVERY' | 'DINE_IN'>('PICKUP');
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [productDialog, setProductDialog] = useState<Product | null>(null);
  const [offerDialog, setOfferDialog] = useState<Offer | null>(null);
  const [customerId, setCustomerId] = useState<string | undefined>();
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerLookup, setCustomerLookup] = useState<CustomerLookup | null>(null);
  const [lookupState, setLookupState] = useState<'idle' | 'loading' | 'not-found' | 'error'>(
    'idle',
  );
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [address, setAddress] = useState(EMPTY_ADDRESS);
  const [tableId, setTableId] = useState<string | undefined>();
  const [couponCode, setCouponCode] = useState('');
  const [orderNotes, setOrderNotes] = useState('');
  const [saveCustomerData, setSaveCustomerData] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<
    'PIX' | 'CASH' | 'CARD_ON_DELIVERY' | 'CARD_IN_PERSON' | ''
  >('');
  const [paidNow, setPaidNow] = useState(false);
  const [changeFor, setChangeFor] = useState('');
  const [manualDiscountMode, setManualDiscountMode] = useState<'FIXED' | 'PERCENTAGE'>('FIXED');
  const [manualDiscountValue, setManualDiscountValue] = useState('');
  const [manualDiscountReason, setManualDiscountReason] = useState<
    'COURTESY' | 'SERVICE_RECOVERY' | 'NEGOTIATED' | 'OTHER'
  >('COURTESY');
  const [manualDiscountNote, setManualDiscountNote] = useState('');
  const [showManualDiscount, setShowManualDiscount] = useState(false);
  const [drafts, setDrafts] = useState<PosDraftSummary[]>([]);
  const [activeDraft, setActiveDraft] = useState<{ id: string; version: number } | null>(null);
  const [draftsOpen, setDraftsOpen] = useState(false);
  const [recentsOpen, setRecentsOpen] = useState(false);
  const [operationState, setOperationState] = useState<'idle' | 'loading'>('idle');
  const [operationError, setOperationError] = useState<string | null>(null);
  const [focusMode, setFocusMode] = useState(false);
  const [selectedTerminalId, setSelectedTerminalId] = useState('');
  const [operations, setOperations] = useState(initialData.operations);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [newTerminalName, setNewTerminalName] = useState('');
  const [shortcutTarget, setShortcutTarget] = useState('');
  const [quote, setQuote] = useState<PosQuoteData>();
  const [quotedIntentKey, setQuotedIntentKey] = useState<string | null>(null);
  const [quoteState, setQuoteState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoteRevision, setQuoteRevision] = useState(0);
  const [submitState, setSubmitState] = useState<'idle' | 'loading'>('idle');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{
    orderNumber: number;
    publicToken: string;
    orderId: string;
  } | null>(null);
  const submittingRef = useRef(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const idempotencyAttemptRef = useRef<{ fingerprint: string; key: string } | null>(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const remembered = window.localStorage.getItem('pedidolocal:pos-terminal');
      const activeTerminals = operations.terminals.filter((terminal) => terminal.isActive);
      const selected = activeTerminals.some((terminal) => terminal.id === remembered)
        ? remembered!
        : (activeTerminals[0]?.id ?? '');
      setSelectedTerminalId(selected);
      void refreshDrafts();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [operations.terminals]);

  const filteredProducts = useMemo(() => {
    const query = normalizeSearch(search);
    return initialData.products.filter(
      (product) =>
        (!categoryId || product.categoryId === categoryId) &&
        (!query || normalizeSearch(product.name).includes(query)),
    );
  }, [categoryId, initialData.products, search]);

  const availablePaymentMethods = useMemo(() => {
    const settings = initialData.settings;
    if (!settings) return [] as Array<{ value: Exclude<typeof paymentMethod, ''>; label: string }>;
    const methods: Array<{ value: Exclude<typeof paymentMethod, ''>; label: string }> = [];
    if (settings.acceptsCash)
      methods.push({
        value: 'CASH',
        label: modality === 'DELIVERY' ? 'Dinheiro na entrega' : 'Dinheiro',
      });
    if (modality === 'DELIVERY' && settings.acceptsCardOnDelivery) {
      methods.push({ value: 'CARD_ON_DELIVERY', label: 'Cartão na entrega' });
    }
    if (modality !== 'DELIVERY' && settings.acceptsCardInPerson) {
      methods.push({ value: 'CARD_IN_PERSON', label: 'Cartão presencial' });
    }
    if (settings.acceptsPix && settings.pixKey && settings.pixKeyType) {
      methods.push({ value: 'PIX', label: 'Pix manual' });
    }
    return methods;
  }, [initialData.settings, modality]);
  const activePaymentMethod = availablePaymentMethods.some(
    (method) => method.value === paymentMethod,
  )
    ? paymentMethod
    : (availablePaymentMethods[0]?.value ?? '');
  const activePaidNow = paidNow && (modality !== 'DELIVERY' || activePaymentMethod === 'PIX');
  const manualDiscount = useMemo<PosManualDiscountInput | undefined>(() => {
    if (!showManualDiscount || !initialData.capabilities.canApplyManualDiscount) return undefined;
    const value =
      manualDiscountMode === 'FIXED'
        ? parseCurrencyToCents(manualDiscountValue)
        : parsePercentageToBasisPoints(manualDiscountValue);
    if (!value || (manualDiscountReason === 'OTHER' && manualDiscountNote.trim().length < 3)) {
      return undefined;
    }
    return {
      mode: manualDiscountMode,
      value,
      reasonCode: manualDiscountReason,
      reasonNote: manualDiscountReason === 'OTHER' ? manualDiscountNote.trim() : undefined,
    };
  }, [
    initialData.capabilities.canApplyManualDiscount,
    manualDiscountMode,
    manualDiscountNote,
    manualDiscountReason,
    manualDiscountValue,
    showManualDiscount,
  ]);
  const quoteIntent = useMemo<PosQuoteInput>(
    () => ({
      modality,
      diningTableId: modality === 'DINE_IN' ? tableId : undefined,
      customerId,
      customerName,
      customerPhone,
      deliveryAddress: modality === 'DELIVERY' ? address : undefined,
      items: stripCartMetadata(cart),
      couponCode: couponCode.trim() || undefined,
      manualDiscount,
      notes: orderNotes,
    }),
    [
      address,
      cart,
      couponCode,
      customerId,
      customerName,
      customerPhone,
      modality,
      manualDiscount,
      orderNotes,
      tableId,
    ],
  );
  const quoteIntentKey = useMemo(() => JSON.stringify(quoteIntent), [quoteIntent]);
  const canRequestQuote =
    cart.length > 0 &&
    !initialData.availability.blocksPos &&
    (modality !== 'DINE_IN' || Boolean(tableId)) &&
    (modality !== 'DELIVERY' ||
      Boolean(
        customerName &&
        customerPhone &&
        address.deliveryZoneId &&
        address.street &&
        address.number &&
        address.neighborhood &&
        address.city &&
        address.state,
      ));

  useEffect(() => {
    const controller = new AbortController();
    const resetTimeout = window.setTimeout(() => {
      setQuote(undefined);
      setQuotedIntentKey(null);
      setQuoteError(null);
      setQuoteState(canRequestQuote ? 'loading' : 'idle');
    }, 0);
    if (!canRequestQuote) {
      return () => {
        controller.abort();
        window.clearTimeout(resetTimeout);
      };
    }
    const quoteTimeout = window.setTimeout(async () => {
      const result = await quotePosOrderAction(quoteIntent);
      if (controller.signal.aborted) return;
      if (result.success) {
        setQuote(result.data);
        setQuotedIntentKey(quoteIntentKey);
        setQuoteState('ready');
      } else {
        setQuoteState('error');
        setQuoteError(result.error.message);
      }
    }, 320);
    return () => {
      controller.abort();
      window.clearTimeout(resetTimeout);
      window.clearTimeout(quoteTimeout);
    };
  }, [canRequestQuote, quoteIntent, quoteIntentKey, quoteRevision]);

  function addProduct(product: Product) {
    if (!product.isAvailable || product.isSoldOut) return;
    if (product.optionGroups.length > 0) {
      setProductDialog(product);
      return;
    }
    setCart((current) => [
      ...current,
      {
        kind: 'PRODUCT',
        lineId: crypto.randomUUID(),
        productId: product.id,
        quantity: 1,
        notes: '',
        optionIds: [],
        label: product.name,
        displayPrice: product.basePrice,
      },
    ]);
  }

  function resetForNextOrder() {
    setCart([]);
    setCustomerId(undefined);
    setCustomerName('');
    setCustomerPhone('');
    setCustomerLookup(null);
    setAddress(EMPTY_ADDRESS);
    setTableId(undefined);
    setCouponCode('');
    setOrderNotes('');
    setSaveCustomerData(false);
    setPaidNow(false);
    setChangeFor('');
    setManualDiscountValue('');
    setManualDiscountNote('');
    setShowManualDiscount(false);
    setActiveDraft(null);
    setSuccess(null);
    setSubmitError(null);
    idempotencyAttemptRef.current = null;
  }

  async function refreshDrafts() {
    const result = await listOpenPosDraftsAction();
    if (result.success) setDrafts(result.data as PosDraftSummary[]);
  }

  function restoreDraftIntent(intent: PosDraftIntentInput) {
    setModality(intent.modality);
    setTableId(intent.diningTableId);
    setCustomerId(intent.customerId);
    setCustomerName(intent.customerName);
    setCustomerPhone(intent.customerPhone);
    setAddress(
      intent.deliveryAddress
        ? {
            ...EMPTY_ADDRESS,
            ...intent.deliveryAddress,
            customerAddressId: intent.deliveryAddress.customerAddressId,
            postalCode: intent.deliveryAddress.postalCode ?? '',
          }
        : EMPTY_ADDRESS,
    );
    setCouponCode(intent.couponCode ?? '');
    setOrderNotes(intent.notes);
    setSaveCustomerData(intent.saveCustomerData);
    setPaymentMethod(intent.paymentMethod ?? '');
    setPaidNow(intent.paidNow);
    setChangeFor(intent.changeFor ? String(intent.changeFor / 100).replace('.', ',') : '');
    if (intent.manualDiscount) {
      setShowManualDiscount(true);
      setManualDiscountMode(intent.manualDiscount.mode);
      setManualDiscountValue(
        intent.manualDiscount.mode === 'FIXED'
          ? String(intent.manualDiscount.value / 100).replace('.', ',')
          : String(intent.manualDiscount.value / 100).replace('.', ','),
      );
      setManualDiscountReason(intent.manualDiscount.reasonCode);
      setManualDiscountNote(intent.manualDiscount.reasonNote ?? '');
    }
    const restored = intent.items.flatMap<CartLine>((line) => {
      if (line.kind === 'COMBO') {
        const offer = initialData.offers.find((candidate) => candidate.id === line.comboId);
        return offer && offer.kind !== 'PRODUCT_PROMOTION'
          ? [{ ...line, label: offer.name, displayPrice: offer.offerPrice }]
          : [];
      }
      const product = initialData.products.find((candidate) => candidate.id === line.productId);
      if (!product) return [];
      const optionsPrice = product.optionGroups
        .flatMap((group) => group.options)
        .filter((option) => line.optionIds.includes(option.id))
        .reduce((sum, option) => sum + option.price, 0);
      return [{ ...line, label: product.name, displayPrice: product.basePrice + optionsPrice }];
    });
    setCart(restored);
  }

  async function holdOrder() {
    if (cart.length === 0 || operationState === 'loading') return;
    setOperationState('loading');
    setOperationError(null);
    const draftId = activeDraft?.id ?? crypto.randomUUID();
    const intent: PosDraftIntentInput = {
      ...quoteIntent,
      paymentMethod: activePaymentMethod || undefined,
      paidNow: activePaidNow,
      changeFor: activePaymentMethod === 'CASH' ? parseCurrencyToCents(changeFor) : undefined,
      saveCustomerData,
    };
    const result = await savePosDraftAction({
      draftId,
      expectedVersion: activeDraft?.version,
      terminalId: selectedTerminalId || undefined,
      intent,
    });
    setOperationState('idle');
    if (!result.success) {
      setOperationError(result.error.message);
      return;
    }
    resetForNextOrder();
    await refreshDrafts();
    setDraftsOpen(true);
  }

  async function resumeDraft(draftId: string) {
    setOperationState('loading');
    setOperationError(null);
    const result = await resumePosDraftAction(draftId);
    setOperationState('idle');
    if (!result.success) {
      setOperationError(result.error.message);
      await refreshDrafts();
      return;
    }
    restoreDraftIntent(result.data.intent);
    setActiveDraft({ id: result.data.id, version: result.data.version });
    if (result.data.terminal?.isActive) setSelectedTerminalId(result.data.terminal.id);
    setDraftsOpen(false);
  }

  async function discardDraft(draftId: string, expectedVersion: number) {
    const result = await discardPosDraftAction({ draftId, expectedVersion });
    if (!result.success) setOperationError(result.error.message);
    await refreshDrafts();
  }

  async function repeatRecentOrder(orderId: string) {
    setOperationState('loading');
    setOperationError(null);
    const result = await repeatPosOrderAction(orderId);
    setOperationState('idle');
    if (!result.success) {
      setOperationError(result.error.message);
      return;
    }
    setCart(
      result.data.readyItems.map((item) => ({
        kind: 'PRODUCT' as const,
        lineId: crypto.randomUUID(),
        productId: item.productId,
        quantity: item.quantity,
        notes: item.notes,
        optionIds: item.selectedOptions.map((option) => option.id),
        label: item.productName,
        displayPrice: item.unitPrice,
      })),
    );
    setCouponCode('');
    setPaidNow(false);
    setChangeFor('');
    setActiveDraft(null);
    setRecentsOpen(false);
    if (result.data.issues.length > 0) {
      setOperationError(result.data.issues.map((issue) => issue.message).join(' '));
    }
  }

  async function createTerminal() {
    if (!newTerminalName.trim()) return;
    const result = await savePosTerminalAction({ name: newTerminalName });
    if (!result.success) {
      setOperationError(result.error.message);
      return;
    }
    setOperations((current) => ({
      ...current,
      terminals: [...current.terminals, result.data].sort((left, right) =>
        left.name.localeCompare(right.name, 'pt-BR'),
      ),
    }));
    setNewTerminalName('');
  }

  async function deactivateTerminal(id: string, expectedVersion: number) {
    const result = await deactivatePosTerminalAction({ id, expectedVersion });
    if (!result.success) {
      setOperationError(result.error.message);
      return;
    }
    setOperations((current) => ({
      ...current,
      terminals: current.terminals.map((terminal) =>
        terminal.id === id
          ? { ...terminal, isActive: false, version: result.data.version }
          : terminal,
      ),
    }));
  }

  async function createShortcut() {
    const [kind, id] = shortcutTarget.split(':');
    if (!id) return;
    const result = await createPosShortcutAction(
      kind === 'product' ? { productId: id } : { offerId: id },
    );
    if (!result.success) {
      setOperationError(result.error.message);
      return;
    }
    setOperations((current) => ({ ...current, shortcuts: result.data }));
    setShortcutTarget('');
  }

  async function removeShortcut(id: string) {
    const result = await deletePosShortcutAction({ id });
    if (!result.success) {
      setOperationError(result.error.message);
      return;
    }
    setOperations((current) => ({ ...current, shortcuts: result.data }));
  }

  async function moveShortcut(id: string, direction: -1 | 1) {
    const ids = operations.shortcuts.map((shortcut) => shortcut.id);
    const index = ids.indexOf(id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    const result = await reorderPosShortcutsAction({ shortcutIds: ids });
    if (!result.success) {
      setOperationError(result.error.message);
      return;
    }
    setOperations((current) => ({ ...current, shortcuts: result.data }));
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const editing = target?.matches('input, textarea, select, [contenteditable="true"]') ?? false;
      if (event.key === '/' && !editing) {
        event.preventDefault();
        searchRef.current?.focus();
      } else if (event.altKey && !editing && event.key === '1') {
        event.preventDefault();
        setModality('PICKUP');
      } else if (event.altKey && !editing && event.key === '2') {
        event.preventDefault();
        setModality('DELIVERY');
      } else if (event.altKey && !editing && event.key === '3') {
        event.preventDefault();
        setModality('DINE_IN');
      } else if (event.altKey && !editing && event.key.toLocaleLowerCase() === 'h') {
        event.preventDefault();
        void holdOrder();
      } else if (event.key === '?' && !editing) {
        setOperationError(
          'Atalhos: / busca · Alt+1 retirada · Alt+2 entrega · Alt+3 mesa · Alt+H espera.',
        );
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  async function lookupCustomer() {
    setLookupState('loading');
    setLookupError(null);
    const result = await lookupPosCustomerAction(customerPhone);
    if (!result.success) {
      setCustomerLookup(null);
      setCustomerId(undefined);
      setLookupError(result.error.message);
      setLookupState('error');
      return;
    }
    if (!result.data) {
      setCustomerLookup(null);
      setCustomerId(undefined);
      setLookupState('not-found');
      return;
    }
    setCustomerLookup(result.data);
    setCustomerId(result.data.id);
    setCustomerName(result.data.name);
    setCustomerPhone(result.data.phone);
    setLookupState('idle');
  }

  function selectSavedAddress(saved: CustomerLookup['addresses'][number]) {
    setAddress({
      customerAddressId: saved.id,
      deliveryZoneId: saved.deliveryZoneId ?? '',
      postalCode: saved.zipCode ?? '',
      street: saved.street,
      number: saved.number,
      complement: saved.complement ?? '',
      neighborhood: saved.neighborhood,
      city: saved.city,
      state: saved.state,
      reference: saved.reference ?? '',
      label: saved.label,
    });
  }

  async function finalizeOrder() {
    if (!quote?.quote.canCheckout || !activePaymentMethod || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitState('loading');
    setSubmitError(null);
    const changeForCents = parseCurrencyToCents(changeFor);
    let finalDraft = activeDraft;
    if (activeDraft) {
      const savedDraft = await savePosDraftAction({
        draftId: activeDraft.id,
        expectedVersion: activeDraft.version,
        terminalId: selectedTerminalId || undefined,
        intent: {
          ...quoteIntent,
          paymentMethod: activePaymentMethod,
          paidNow: activePaidNow,
          changeFor: activePaymentMethod === 'CASH' ? changeForCents : undefined,
          saveCustomerData,
        },
      });
      if (!savedDraft.success) {
        setSubmitError(savedDraft.error.message);
        submittingRef.current = false;
        setSubmitState('idle');
        return;
      }
      finalDraft = { id: savedDraft.data.id, version: savedDraft.data.version };
      setActiveDraft(finalDraft);
    }
    const orderIntent = {
      modality,
      diningTableId: modality === 'DINE_IN' ? tableId : undefined,
      customerId,
      customerName,
      customerPhone,
      deliveryAddress: modality === 'DELIVERY' ? address : undefined,
      items: stripCartMetadata(cart),
      couponCode: couponCode.trim() || undefined,
      manualDiscount,
      notes: orderNotes,
      paymentMethod: activePaymentMethod,
      paidNow: activePaidNow,
      changeFor: activePaymentMethod === 'CASH' ? changeForCents : undefined,
      saveCustomerData,
      posTerminalId: selectedTerminalId || undefined,
      draftId: finalDraft?.id,
      expectedDraftVersion: finalDraft?.version,
      expectedQuoteFingerprint: quote.quote.quoteFingerprint,
    };
    const fingerprint = JSON.stringify(orderIntent);
    const idempotencyKey =
      idempotencyAttemptRef.current?.fingerprint === fingerprint
        ? idempotencyAttemptRef.current.key
        : crypto.randomUUID();
    idempotencyAttemptRef.current = { fingerprint, key: idempotencyKey };
    const input = { ...orderIntent, idempotencyKey } satisfies PosOrderInput;
    try {
      const result = await createPosOrderAction(input);
      if (!result.success) {
        setSubmitError(result.error.message);
        setQuoteRevision((value) => value + 1);
        return;
      }
      setSuccess({
        orderId: result.data.orderId,
        orderNumber: result.data.orderNumber,
        publicToken: result.data.publicToken,
      });
    } catch {
      setSubmitError('Não foi possível confirmar o pedido. Tente novamente.');
    } finally {
      submittingRef.current = false;
      setSubmitState('idle');
    }
  }

  if (success) {
    return (
      <main className="mx-auto flex min-h-[calc(100dvh-5rem)] max-w-3xl items-center justify-center p-4 sm:p-8">
        <section className="border-border bg-surface w-full rounded-2xl border p-6 text-center sm:p-10">
          <div className="bg-success-light text-success mx-auto flex h-16 w-16 items-center justify-center rounded-full">
            <Check className="h-8 w-8" aria-hidden="true" />
          </div>
          <h1 className="text-text-primary mt-5 text-2xl font-bold">
            Pedido <span className="font-mono">#{success.orderNumber}</span> criado
          </h1>
          <p className="text-text-secondary mt-2">
            Já está confirmado e entrou na fila operacional da cozinha.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <Button size="lg" onClick={resetForNextOrder}>
              <CirclePlus aria-hidden="true" /> Novo pedido
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href={`/dashboard/orders?open=${success.orderId}`}>Ver na Central</Link>
            </Button>
          </div>
        </section>
      </main>
    );
  }

  const localSubtotal = cart.reduce((sum, line) => sum + line.displayPrice * line.quantity, 0);
  const quoteReady =
    quoteState === 'ready' && quote?.quote.canCheckout && quotedIntentKey === quoteIntentKey;
  const changeForCents = parseCurrencyToCents(changeFor);
  const currentTotal = quote?.quote.total ?? localSubtotal;
  const cashChangeInvalid =
    activePaymentMethod === 'CASH' && changeForCents != null && changeForCents < currentTotal;
  const canChoosePaidNow =
    initialData.capabilities.canConfirmPayment &&
    (modality !== 'DELIVERY' || activePaymentMethod === 'PIX');

  return (
    <main
      className={cn(
        'pos-workspace bg-papel min-h-[calc(100dvh-4rem)] pb-28 xl:pb-0',
        focusMode && 'fixed inset-0 z-40 min-h-dvh overflow-y-auto',
      )}
    >
      <div className="border-border bg-surface sticky top-0 z-20 border-b px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-[96rem] items-center justify-between gap-4">
          <div>
            <h1 className="text-text-primary text-xl font-bold sm:text-2xl">Novo pedido</h1>
            <p className="text-text-secondary text-sm">{initialData.store.name} · PDV</p>
          </div>
          <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
            {operations.terminals.some((terminal) => terminal.isActive) ? (
              <label className="sr-only" htmlFor="pos-terminal">
                Terminal do PDV
              </label>
            ) : null}
            {operations.terminals.some((terminal) => terminal.isActive) ? (
              <select
                id="pos-terminal"
                className="border-border bg-surface focus-visible:ring-brand-500 h-11 max-w-44 rounded-lg border px-3 text-sm font-semibold focus-visible:ring-2 focus-visible:outline-none"
                value={selectedTerminalId}
                onChange={(event) => {
                  setSelectedTerminalId(event.target.value);
                  window.localStorage.setItem('pedidolocal:pos-terminal', event.target.value);
                }}
              >
                {operations.terminals
                  .filter((terminal) => terminal.isActive)
                  .map((terminal) => (
                    <option key={terminal.id} value={terminal.id}>
                      {terminal.name}
                    </option>
                  ))}
              </select>
            ) : null}
            <Button variant="outline" onClick={() => setDraftsOpen(true)}>
              <Clock3 /> Em espera {drafts.length > 0 ? `(${drafts.length})` : ''}
            </Button>
            <Button variant="outline" onClick={() => setRecentsOpen(true)}>
              <Clock3 /> Recentes
            </Button>
            <Button
              variant="outline"
              disabled={cart.length === 0 || operationState === 'loading'}
              onClick={() => void holdOrder()}
            >
              {operationState === 'loading' ? <Loader2 className="animate-spin" /> : <Clock3 />}
              Em espera
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={focusMode ? 'Sair do modo foco' : 'Ativar modo foco'}
              onClick={() => setFocusMode((value) => !value)}
            >
              {focusMode ? <X /> : <Maximize2 />}
            </Button>
            {initialData.capabilities.canManagePosShortcuts ||
            initialData.capabilities.canManagePosTerminals ? (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Configurar PDV"
                onClick={() => setSettingsOpen(true)}
              >
                <Settings2 />
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      {operationError ? (
        <div
          role="status"
          className="bg-warning-light text-warning mx-auto mt-3 flex max-w-[96rem] items-start justify-between gap-3 rounded-xl px-4 py-3 text-sm font-semibold"
        >
          <span>{operationError}</span>
          <button type="button" aria-label="Fechar aviso" onClick={() => setOperationError(null)}>
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      {initialData.availability.blocksPos ? (
        <div className="bg-error-light text-error mx-auto mt-4 flex max-w-[96rem] items-start gap-2 rounded-xl px-4 py-3 text-sm font-semibold">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {initialData.availability.reason}
        </div>
      ) : !initialData.availability.state.startsWith('OPEN') ? (
        <div className="bg-warning-light text-warning mx-auto mt-4 flex max-w-[96rem] items-start gap-2 rounded-xl px-4 py-3 text-sm font-semibold">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          Loja fechada para o público. O PDV continua disponível para a equipe.
        </div>
      ) : null}

      <div className="mx-auto grid max-w-[96rem] xl:grid-cols-[minmax(0,1fr)_25rem]">
        <section className="xl:border-border min-w-0 p-4 sm:p-6 xl:border-r">
          <div
            className="grid grid-cols-3 gap-2"
            role="radiogroup"
            aria-label="Modalidade do pedido"
          >
            {[
              { value: 'PICKUP' as const, label: 'Retirada', icon: PackageOpen },
              { value: 'DELIVERY' as const, label: 'Entrega', icon: Truck },
              { value: 'DINE_IN' as const, label: 'Mesa', icon: Utensils },
            ].map((item) => (
              <button
                key={item.value}
                type="button"
                role="radio"
                aria-checked={modality === item.value}
                disabled={
                  (item.value === 'DELIVERY' && !initialData.settings?.deliveryEnabled) ||
                  (item.value === 'PICKUP' && !initialData.settings?.pickupEnabled) ||
                  (item.value === 'DINE_IN' && !initialData.capabilities.canUseDiningRoom)
                }
                onClick={() => {
                  setModality(item.value);
                  setPaidNow(false);
                }}
                className={cn(
                  'border-border bg-surface focus-visible:ring-brand-500 flex min-h-14 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-45',
                  modality === item.value && 'border-brand-500 bg-brand-50 text-brand-700',
                )}
              >
                <item.icon className="h-4 w-4" aria-hidden="true" />
                {item.label}
              </button>
            ))}
          </div>

          {modality === 'DELIVERY' ? (
            <section
              className="border-border bg-surface mt-4 rounded-2xl border p-4"
              aria-labelledby="delivery-customer-heading"
            >
              <h2 id="delivery-customer-heading" className="font-bold">
                Cliente e entrega
              </h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]">
                <label className="text-sm font-semibold">
                  Telefone
                  <Input
                    className="mt-1"
                    inputMode="tel"
                    value={customerPhone}
                    onChange={(event) => {
                      setCustomerPhone(event.target.value);
                      setCustomerId(undefined);
                      setCustomerLookup(null);
                    }}
                    placeholder="(11) 99999-9999"
                  />
                </label>
                {initialData.capabilities.canLookupCustomer ? (
                  <Button
                    className="self-end"
                    variant="outline"
                    disabled={lookupState === 'loading'}
                    onClick={lookupCustomer}
                  >
                    {lookupState === 'loading' ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <UserRoundSearch />
                    )}
                    Buscar cliente
                  </Button>
                ) : null}
              </div>
              <div aria-live="polite">
                {lookupState === 'not-found' ? (
                  <p className="text-text-secondary mt-2 text-sm">
                    Cliente não encontrado. Continue com um novo cadastro.
                  </p>
                ) : null}
                {lookupState === 'error' ? (
                  <p className="text-error mt-2 text-sm font-semibold">{lookupError}</p>
                ) : null}
              </div>
              {customerLookup ? (
                <div className="bg-success-light mt-3 rounded-xl p-3">
                  <p className="text-success font-semibold">
                    Cliente encontrado · {customerLookup.name}
                  </p>
                  {customerLookup.addresses.length > 0 ? (
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      {customerLookup.addresses.map((saved) => (
                        <button
                          key={saved.id}
                          type="button"
                          onClick={() => selectSavedAddress(saved)}
                          className="border-success/25 bg-surface focus-visible:ring-brand-500 min-h-12 rounded-lg border px-3 py-2 text-left text-sm focus-visible:ring-2 focus-visible:outline-none"
                        >
                          <strong>
                            {saved.label === 'HOME'
                              ? 'Casa'
                              : saved.label === 'WORK'
                                ? 'Trabalho'
                                : 'Endereço'}
                          </strong>
                          <span className="text-text-secondary block">
                            {saved.street}, {saved.number}
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-text-secondary mt-1 text-sm">Sem endereço salvo.</p>
                  )}
                </div>
              ) : null}
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="text-sm font-semibold">
                  Nome
                  <Input
                    className="mt-1"
                    value={customerName}
                    onChange={(event) => setCustomerName(event.target.value)}
                  />
                </label>
                <label className="text-sm font-semibold">
                  Região de entrega
                  <select
                    className="border-border bg-surface focus-visible:ring-brand-500 mt-1 h-11 w-full rounded-lg border px-3 text-sm focus-visible:ring-2 focus-visible:outline-none"
                    value={address.deliveryZoneId}
                    onChange={(event) => {
                      const zone = initialData.deliveryZones.find(
                        (item) => item.id === event.target.value,
                      );
                      setAddress((current) => ({
                        ...current,
                        deliveryZoneId: event.target.value,
                        neighborhood: current.neighborhood || zone?.name || '',
                      }));
                    }}
                  >
                    <option value="">Selecione</option>
                    {initialData.deliveryZones.map((zone) => (
                      <option key={zone.id} value={zone.id}>
                        {zone.name} · {formatCurrency(zone.fee)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm font-semibold">
                  CEP
                  <Input
                    className="mt-1"
                    inputMode="numeric"
                    value={address.postalCode}
                    onChange={(event) =>
                      setAddress((current) => ({ ...current, postalCode: event.target.value }))
                    }
                  />
                </label>
                <label className="text-sm font-semibold">
                  Rua
                  <Input
                    className="mt-1"
                    value={address.street}
                    onChange={(event) =>
                      setAddress((current) => ({
                        ...current,
                        street: event.target.value,
                        customerAddressId: undefined,
                      }))
                    }
                  />
                </label>
                <label className="text-sm font-semibold">
                  Número
                  <Input
                    className="mt-1"
                    value={address.number}
                    onChange={(event) =>
                      setAddress((current) => ({
                        ...current,
                        number: event.target.value,
                        customerAddressId: undefined,
                      }))
                    }
                  />
                </label>
                <label className="text-sm font-semibold">
                  Complemento
                  <Input
                    className="mt-1"
                    value={address.complement}
                    onChange={(event) =>
                      setAddress((current) => ({
                        ...current,
                        complement: event.target.value,
                        customerAddressId: undefined,
                      }))
                    }
                  />
                </label>
                <label className="text-sm font-semibold">
                  Bairro
                  <Input
                    className="mt-1"
                    value={address.neighborhood}
                    onChange={(event) =>
                      setAddress((current) => ({
                        ...current,
                        neighborhood: event.target.value,
                        customerAddressId: undefined,
                      }))
                    }
                  />
                </label>
                <label className="text-sm font-semibold">
                  Cidade
                  <Input
                    className="mt-1"
                    value={address.city}
                    onChange={(event) =>
                      setAddress((current) => ({
                        ...current,
                        city: event.target.value,
                        customerAddressId: undefined,
                      }))
                    }
                  />
                </label>
                <label className="text-sm font-semibold">
                  UF
                  <Input
                    className="mt-1 uppercase"
                    maxLength={2}
                    value={address.state}
                    onChange={(event) =>
                      setAddress((current) => ({
                        ...current,
                        state: event.target.value.toUpperCase(),
                        customerAddressId: undefined,
                      }))
                    }
                  />
                </label>
                <label className="text-sm font-semibold sm:col-span-2">
                  Referência
                  <Input
                    className="mt-1"
                    value={address.reference}
                    onChange={(event) =>
                      setAddress((current) => ({
                        ...current,
                        reference: event.target.value,
                        customerAddressId: undefined,
                      }))
                    }
                  />
                </label>
              </div>
              <label className="mt-3 flex min-h-11 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={saveCustomerData}
                  onChange={(event) => setSaveCustomerData(event.target.checked)}
                  className="accent-brand-600 h-4 w-4"
                />
                Salvar cliente e endereço para próximos atendimentos
              </label>
            </section>
          ) : modality === 'DINE_IN' ? (
            <section
              className="border-border bg-surface mt-4 rounded-2xl border p-4"
              aria-labelledby="table-heading"
            >
              <h2 id="table-heading" className="font-bold">
                Escolha a mesa
              </h2>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {initialData.tables.map((table) => (
                  <button
                    key={table.id}
                    type="button"
                    aria-pressed={tableId === table.id}
                    onClick={() => setTableId(table.id)}
                    className={cn(
                      'border-border bg-surface focus-visible:ring-brand-500 min-h-16 rounded-xl border px-3 text-left focus-visible:ring-2 focus-visible:outline-none',
                      tableId === table.id && 'border-brand-500 bg-brand-50',
                    )}
                  >
                    <strong className="block">{table.label}</strong>
                    <span className={cn('text-xs', table.session ? 'text-info' : 'text-success')}>
                      {table.session ? 'Em atendimento' : 'Livre'}
                    </span>
                  </button>
                ))}
              </div>
              <label className="mt-3 block text-sm font-semibold">
                Nome do cliente (opcional)
                <Input
                  className="mt-1"
                  value={customerName}
                  onChange={(event) => setCustomerName(event.target.value)}
                />
              </label>
            </section>
          ) : (
            <section className="border-border bg-surface mt-4 rounded-2xl border p-4">
              <h2 className="font-bold">Cliente (opcional)</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="text-sm font-semibold">
                  Nome
                  <Input
                    className="mt-1"
                    value={customerName}
                    onChange={(event) => setCustomerName(event.target.value)}
                  />
                </label>
                <label className="text-sm font-semibold">
                  Telefone
                  <Input
                    className="mt-1"
                    inputMode="tel"
                    value={customerPhone}
                    onChange={(event) => setCustomerPhone(event.target.value)}
                  />
                </label>
              </div>
            </section>
          )}

          <div className="mt-5 flex items-center gap-2">
            <Search className="text-text-muted h-5 w-5" aria-hidden="true" />
            <Input
              ref={searchRef}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar produto por nome"
              aria-label="Buscar produto por nome"
            />
          </div>
          {operations.shortcuts.length > 0 ? (
            <section className="mt-4" aria-labelledby="pos-shortcuts-heading">
              <div className="flex items-center justify-between gap-3">
                <h2 id="pos-shortcuts-heading" className="flex items-center gap-2 font-bold">
                  <Star className="text-brand-600 h-4 w-4" /> Favoritos
                </h2>
                <span className="text-text-secondary text-xs">Atalhos da loja</span>
              </div>
              <div className="mt-2 flex gap-2 overflow-x-auto pb-2">
                {operations.shortcuts.map((shortcut) => {
                  const product = shortcut.product
                    ? initialData.products.find((item) => item.id === shortcut.product!.id)
                    : null;
                  const offer = shortcut.offer
                    ? initialData.offers.find((item) => item.id === shortcut.offer!.id)
                    : null;
                  const available =
                    shortcut.product?.available ?? shortcut.offer?.available ?? false;
                  return (
                    <button
                      key={shortcut.id}
                      type="button"
                      disabled={!available}
                      onClick={() => {
                        if (product) addProduct(product);
                        if (offer) setOfferDialog(offer);
                      }}
                      className="border-border bg-surface focus-visible:ring-brand-500 flex min-h-16 min-w-44 shrink-0 items-center justify-between gap-3 rounded-xl border px-3 text-left focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
                    >
                      <span className="min-w-0">
                        <strong className="block truncate">
                          {shortcut.product?.name ?? shortcut.offer?.name}
                        </strong>
                        <small className="text-text-secondary">
                          {available ? 'Adicionar ao pedido' : 'Indisponível'}
                        </small>
                      </span>
                      {available ? (
                        <Plus className="h-4 w-4" />
                      ) : (
                        <AlertCircle className="h-4 w-4" />
                      )}
                    </button>
                  );
                })}
              </div>
            </section>
          ) : null}
          <div className="mt-3 flex gap-2 overflow-x-auto pb-2" aria-label="Categorias">
            <button
              type="button"
              onClick={() => setCategoryId(null)}
              className={cn(
                'border-border min-h-11 shrink-0 rounded-full border px-4 text-sm font-semibold',
                !categoryId && 'border-brand-500 bg-brand-50 text-brand-700',
              )}
            >
              Todos
            </button>
            {initialData.categories.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => setCategoryId(category.id)}
                className={cn(
                  'border-border min-h-11 shrink-0 rounded-full border px-4 text-sm font-semibold',
                  categoryId === category.id && 'border-brand-500 bg-brand-50 text-brand-700',
                )}
              >
                {category.name}
              </button>
            ))}
          </div>

          {initialData.offers.some((offer) => offer.kind !== 'PRODUCT_PROMOTION') &&
          !search &&
          !categoryId ? (
            <section className="mt-4" aria-labelledby="pos-combos-heading">
              <h2 id="pos-combos-heading" className="flex items-center gap-2 font-bold">
                <BadgePercent className="text-brand-600 h-4 w-4" /> Combos
              </h2>
              <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {initialData.offers
                  .filter((offer) => offer.kind !== 'PRODUCT_PROMOTION')
                  .map((offer) => (
                    <button
                      key={offer.id}
                      type="button"
                      onClick={() => setOfferDialog(offer)}
                      className="border-border bg-kraft/45 focus-visible:ring-brand-500 flex min-h-20 items-center justify-between gap-3 rounded-xl border p-3 text-left focus-visible:ring-2 focus-visible:outline-none"
                    >
                      <span>
                        <strong className="block">{offer.name}</strong>
                        <span className="text-text-secondary text-sm">
                          {formatCurrency(offer.offerPrice)}
                        </span>
                      </span>
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  ))}
              </div>
            </section>
          ) : null}

          <section className="mt-5" aria-labelledby="pos-products-heading">
            <div className="flex items-center justify-between">
              <h2 id="pos-products-heading" className="font-bold">
                Produtos
              </h2>
              <span className="text-text-secondary text-sm">{filteredProducts.length} itens</span>
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {filteredProducts.map((product) => {
                const disabled = !product.isAvailable || product.isSoldOut;
                return (
                  <button
                    key={product.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => addProduct(product)}
                    className="border-border bg-surface hover:border-brand-300 focus-visible:ring-brand-500 min-h-24 rounded-xl border p-3 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <strong className="text-text-primary line-clamp-2 block">{product.name}</strong>
                    <span className="text-brand-700 mt-2 block font-mono font-bold">
                      {formatCurrency(product.basePrice)}
                    </span>
                    {disabled ? (
                      <span className="text-error mt-1 block text-xs font-semibold">Esgotado</span>
                    ) : product.optionGroups.length > 0 ? (
                      <span className="text-text-secondary mt-1 block text-xs">
                        Configurar opções
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
            {filteredProducts.length === 0 ? (
              <div className="border-border bg-surface text-text-secondary mt-3 rounded-xl border border-dashed p-6 text-center text-sm">
                Nenhum produto corresponde à busca ou categoria selecionada.
              </div>
            ) : null}
          </section>
        </section>

        <aside className="bg-surface xl:sticky xl:top-[4.5rem] xl:h-[calc(100dvh-4.5rem)] xl:overflow-y-auto">
          <div className="p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-bold">
                <ShoppingBag className="h-5 w-5" /> Pedido
              </h2>
              <span className="font-mono text-sm">
                {cart.reduce((sum, line) => sum + line.quantity, 0)} itens
              </span>
            </div>
            {cart.length === 0 ? (
              <div className="text-text-secondary py-12 text-center">
                <ShoppingBag className="mx-auto h-8 w-8 opacity-45" />
                <p className="mt-3 font-semibold">Pedido vazio</p>
                <p className="mt-1 text-sm">Toque em um produto para começar.</p>
              </div>
            ) : (
              <ul className="divide-border mt-3 divide-y">
                {cart.map((line) => (
                  <li key={line.lineId} className="flex gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold break-words">
                        {line.quantity}× {line.label}
                      </p>
                      <p className="text-text-secondary mt-1 font-mono text-sm">
                        {formatCurrency(line.displayPrice * line.quantity)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Diminuir ${line.label}`}
                        onClick={() =>
                          setCart((current) =>
                            current.flatMap((item) =>
                              item.lineId === line.lineId
                                ? item.quantity > 1
                                  ? [{ ...item, quantity: item.quantity - 1 }]
                                  : []
                                : [item],
                            ),
                          )
                        }
                      >
                        <Minus />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Aumentar ${line.label}`}
                        onClick={() =>
                          setCart((current) =>
                            current.map((item) =>
                              item.lineId === line.lineId
                                ? { ...item, quantity: Math.min(99, item.quantity + 1) }
                                : item,
                            ),
                          )
                        }
                      >
                        <Plus />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Remover ${line.label}`}
                        onClick={() =>
                          setCart((current) =>
                            current.filter((item) => item.lineId !== line.lineId),
                          )
                        }
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {cart.length > 0 ? (
              <div className="mt-5 space-y-4">
                <label className="block text-sm font-semibold">
                  Cupom
                  <Input
                    className="mt-1 uppercase"
                    maxLength={32}
                    value={couponCode}
                    onChange={(event) => setCouponCode(event.target.value.toUpperCase())}
                    placeholder="Código opcional"
                  />
                </label>
                {initialData.capabilities.canApplyManualDiscount ? (
                  <section
                    className="border-border rounded-xl border p-3"
                    aria-labelledby="discount-heading"
                  >
                    <button
                      type="button"
                      className="flex min-h-11 w-full items-center justify-between gap-3 text-left font-semibold"
                      aria-expanded={showManualDiscount}
                      onClick={() => {
                        setShowManualDiscount((value) => !value);
                        if (showManualDiscount) setManualDiscountValue('');
                      }}
                    >
                      <span id="discount-heading" className="flex items-center gap-2">
                        <BadgePercent className="text-brand-600 h-4 w-4" /> Desconto manual
                      </span>
                      <ChevronRight
                        className={cn(
                          'h-4 w-4 transition-transform',
                          showManualDiscount && 'rotate-90',
                        )}
                      />
                    </button>
                    {showManualDiscount ? (
                      <div className="mt-3 space-y-3">
                        <div className="grid grid-cols-2 gap-2">
                          <label className="text-sm font-semibold">
                            Tipo
                            <select
                              className="border-border bg-surface mt-1 h-11 w-full rounded-lg border px-3"
                              value={manualDiscountMode}
                              onChange={(event) =>
                                setManualDiscountMode(event.target.value as 'FIXED' | 'PERCENTAGE')
                              }
                            >
                              <option value="FIXED">Valor</option>
                              <option value="PERCENTAGE">Percentual</option>
                            </select>
                          </label>
                          <label className="text-sm font-semibold">
                            {manualDiscountMode === 'FIXED' ? 'Valor (R$)' : 'Percentual (%)'}
                            <Input
                              className="mt-1"
                              inputMode="decimal"
                              value={manualDiscountValue}
                              onChange={(event) => setManualDiscountValue(event.target.value)}
                            />
                          </label>
                        </div>
                        <label className="block text-sm font-semibold">
                          Motivo
                          <select
                            className="border-border bg-surface mt-1 h-11 w-full rounded-lg border px-3"
                            value={manualDiscountReason}
                            onChange={(event) =>
                              setManualDiscountReason(
                                event.target.value as typeof manualDiscountReason,
                              )
                            }
                          >
                            <option value="COURTESY">Cortesia</option>
                            <option value="SERVICE_RECOVERY">Recuperação de atendimento</option>
                            <option value="NEGOTIATED">Negociação</option>
                            <option value="OTHER">Outro</option>
                          </select>
                        </label>
                        {manualDiscountReason === 'OTHER' ? (
                          <label className="block text-sm font-semibold">
                            Descreva o motivo
                            <Input
                              className="mt-1"
                              maxLength={200}
                              value={manualDiscountNote}
                              onChange={(event) => setManualDiscountNote(event.target.value)}
                            />
                          </label>
                        ) : null}
                        <p className="text-text-secondary text-xs">
                          Aplicado após ofertas e cupom, somente sobre mercadorias. A autorização
                          usa sua sessão.
                        </p>
                      </div>
                    ) : null}
                  </section>
                ) : null}
                <label className="block text-sm font-semibold">
                  Observação do pedido
                  <Textarea
                    className="mt-1"
                    maxLength={500}
                    value={orderNotes}
                    onChange={(event) => setOrderNotes(event.target.value)}
                    placeholder="Informação geral para a operação"
                  />
                </label>

                <fieldset>
                  <legend className="font-bold">Pagamento</legend>
                  <div className="mt-2 grid gap-2">
                    {availablePaymentMethods.map((method) => (
                      <label
                        key={method.value}
                        className={cn(
                          'border-border flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-3 text-sm font-semibold',
                          activePaymentMethod === method.value && 'border-brand-500 bg-brand-50',
                        )}
                      >
                        <input
                          type="radio"
                          name="pos-payment"
                          checked={activePaymentMethod === method.value}
                          onChange={() => {
                            setPaymentMethod(method.value);
                            if (modality === 'DELIVERY' && method.value !== 'PIX') {
                              setPaidNow(false);
                            }
                          }}
                          className="accent-brand-600 h-4 w-4"
                        />
                        {method.label}
                      </label>
                    ))}
                  </div>
                </fieldset>
                {availablePaymentMethods.length === 0 ? (
                  <p role="alert" className="bg-warning-light text-warning rounded-lg p-3 text-sm">
                    Nenhum método de pagamento está habilitado para esta modalidade.
                  </p>
                ) : null}
                {canChoosePaidNow ? (
                  <fieldset>
                    <legend className="text-sm font-semibold">Recebimento</legend>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <label
                        className={cn(
                          'border-border flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm',
                          !activePaidNow && 'border-brand-500 bg-brand-50',
                        )}
                      >
                        <input
                          type="radio"
                          name="pos-receipt"
                          checked={!activePaidNow}
                          onChange={() => setPaidNow(false)}
                        />
                        Receber depois
                      </label>
                      <label
                        className={cn(
                          'border-border flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm',
                          activePaidNow && 'border-brand-500 bg-brand-50',
                        )}
                      >
                        <input
                          type="radio"
                          name="pos-receipt"
                          checked={activePaidNow}
                          onChange={() => setPaidNow(true)}
                        />
                        Pago agora
                      </label>
                    </div>
                  </fieldset>
                ) : (
                  <p className="bg-info-light text-info rounded-lg p-3 text-sm">
                    {initialData.capabilities.canConfirmPayment
                      ? 'Dinheiro e cartão no Delivery são recebidos depois.'
                      : 'Seu perfil cria o pagamento como pendente.'}
                  </p>
                )}
                {activePaymentMethod === 'CASH' ? (
                  <label className="block text-sm font-semibold">
                    Valor recebido (R$)
                    <Input
                      className="mt-1"
                      inputMode="decimal"
                      value={changeFor}
                      onChange={(event) => setChangeFor(event.target.value)}
                      placeholder="Ex.: 100,00"
                    />
                    {changeForCents != null ? (
                      <span
                        className={cn(
                          'mt-1 block text-xs',
                          changeForCents < currentTotal ? 'text-error' : 'text-success',
                        )}
                      >
                        {changeForCents < currentTotal
                          ? `Valor menor que o total (${formatCurrency(currentTotal)}).`
                          : `Troco: ${formatCurrency(changeForCents - currentTotal)}`}
                      </span>
                    ) : null}
                  </label>
                ) : null}

                <dl className="border-border space-y-2 border-t pt-4 text-sm">
                  <div className="flex justify-between">
                    <dt>Subtotal</dt>
                    <dd className="font-mono">
                      {formatCurrency(quote?.quote.subtotal ?? localSubtotal)}
                    </dd>
                  </div>
                  {(quote?.quote.discount ?? 0) - (quote?.quote.manualDiscount ?? 0) > 0 ? (
                    <div className="text-success flex justify-between">
                      <dt>Promoções e cupom</dt>
                      <dd className="font-mono">
                        -
                        {formatCurrency(quote!.quote.discount - (quote!.quote.manualDiscount ?? 0))}
                      </dd>
                    </div>
                  ) : null}
                  {(quote?.quote.manualDiscount ?? 0) > 0 ? (
                    <div className="text-success flex justify-between">
                      <dt>Desconto manual</dt>
                      <dd className="font-mono">
                        -{formatCurrency(quote!.quote.manualDiscount ?? 0)}
                      </dd>
                    </div>
                  ) : null}
                  {modality === 'DELIVERY' ? (
                    <div className="flex justify-between">
                      <dt>Entrega</dt>
                      <dd className="font-mono">
                        {quoteState === 'loading'
                          ? 'Calculando…'
                          : formatCurrency(quote?.quote.deliveryFee ?? 0)}
                      </dd>
                    </div>
                  ) : null}
                  <div className="flex items-baseline justify-between text-lg font-bold">
                    <dt>Total</dt>
                    <dd className="text-brand-700 font-mono text-xl">
                      {formatCurrency(quote?.quote.total ?? localSubtotal)}
                    </dd>
                  </div>
                </dl>
                {quoteState === 'error' || submitError ? (
                  <div
                    role="alert"
                    className="bg-error-light text-error flex items-start gap-2 rounded-xl p-3 text-sm font-semibold"
                  >
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    {submitError ?? quoteError}
                  </div>
                ) : null}
                {quote?.availabilityWarning ? (
                  <div className="bg-warning-light text-warning rounded-xl p-3 text-sm font-semibold">
                    {quote.availabilityWarning}
                  </div>
                ) : null}
                <span className="sr-only" aria-live="polite">
                  {quoteState === 'loading'
                    ? 'Recalculando total.'
                    : quoteState === 'ready'
                      ? `Total atualizado: ${formatCurrency(currentTotal)}.`
                      : ''}
                </span>
                <Button
                  className="hidden w-full xl:inline-flex"
                  size="lg"
                  disabled={
                    !quoteReady ||
                    !activePaymentMethod ||
                    cashChangeInvalid ||
                    submitState === 'loading'
                  }
                  onClick={finalizeOrder}
                >
                  {submitState === 'loading' ? <Loader2 className="animate-spin" /> : <Check />}{' '}
                  {submitState === 'loading' ? 'Finalizando…' : 'Finalizar pedido'}
                </Button>
              </div>
            ) : null}
          </div>
        </aside>
      </div>

      {cart.length > 0 ? (
        <div className="border-border bg-surface fixed inset-x-0 bottom-0 z-30 border-t p-3 xl:hidden">
          <Button
            className="w-full"
            size="lg"
            disabled={
              !quoteReady || !activePaymentMethod || cashChangeInvalid || submitState === 'loading'
            }
            onClick={finalizeOrder}
          >
            {submitState === 'loading' ? <Loader2 className="animate-spin" /> : <Check />}{' '}
            {submitState === 'loading'
              ? 'Finalizando…'
              : `Finalizar · ${formatCurrency(quote?.quote.total ?? localSubtotal)}`}
          </Button>
        </div>
      ) : null}

      <Dialog.Root open={settingsOpen} onOpenChange={setSettingsOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="bg-tinta/55 fixed inset-0 z-50" />
          <Dialog.Content className="bg-surface fixed inset-x-3 top-1/2 z-50 max-h-[90dvh] -translate-y-1/2 overflow-y-auto rounded-2xl p-5 shadow-xl sm:inset-x-auto sm:left-1/2 sm:w-[42rem] sm:-translate-x-1/2">
            <div className="flex items-start justify-between gap-4">
              <div>
                <Dialog.Title className="text-xl font-bold">Configurar PDV</Dialog.Title>
                <Dialog.Description className="text-text-secondary mt-1 text-sm">
                  Terminais identificam o balcão; favoritos aceleram a montagem do pedido.
                </Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <Button variant="ghost" size="icon" aria-label="Fechar configurações do PDV">
                  <X />
                </Button>
              </Dialog.Close>
            </div>

            {initialData.capabilities.canManagePosTerminals ? (
              <section className="mt-6" aria-labelledby="terminals-settings-heading">
                <h2 id="terminals-settings-heading" className="font-bold">
                  Terminais
                </h2>
                <div className="mt-2 flex gap-2">
                  <Input
                    maxLength={80}
                    value={newTerminalName}
                    onChange={(event) => setNewTerminalName(event.target.value)}
                    placeholder="Ex.: Balcão 02"
                    aria-label="Nome do novo terminal"
                  />
                  <Button onClick={() => void createTerminal()}>Adicionar</Button>
                </div>
                <ul className="divide-border mt-3 divide-y">
                  {operations.terminals.map((terminal) => (
                    <li
                      key={terminal.id}
                      className="flex min-h-12 items-center justify-between gap-3 py-2"
                    >
                      <span className="min-w-0">
                        <strong className="block truncate">{terminal.name}</strong>
                        <small className="text-text-secondary">
                          {terminal.isActive ? 'Ativo' : 'Inativo'}
                        </small>
                      </span>
                      {terminal.isActive ? (
                        <Button
                          variant="ghost"
                          onClick={() => void deactivateTerminal(terminal.id, terminal.version)}
                        >
                          Desativar
                        </Button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {initialData.capabilities.canManagePosShortcuts ? (
              <section
                className="border-border mt-6 border-t pt-5"
                aria-labelledby="shortcuts-settings-heading"
              >
                <h2 id="shortcuts-settings-heading" className="font-bold">
                  Produtos rápidos
                </h2>
                <div className="mt-2 flex gap-2">
                  <select
                    className="border-border bg-surface focus-visible:ring-brand-500 h-11 min-w-0 flex-1 rounded-lg border px-3 text-sm focus-visible:ring-2 focus-visible:outline-none"
                    value={shortcutTarget}
                    onChange={(event) => setShortcutTarget(event.target.value)}
                    aria-label="Produto ou oferta para fixar"
                  >
                    <option value="">Selecione um produto ou oferta</option>
                    <optgroup label="Produtos">
                      {initialData.products.map((product) => (
                        <option key={product.id} value={`product:${product.id}`}>
                          {product.name}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Ofertas">
                      {initialData.offers
                        .filter((offer) => offer.kind !== 'PRODUCT_PROMOTION')
                        .map((offer) => (
                          <option key={offer.id} value={`offer:${offer.id}`}>
                            {offer.name}
                          </option>
                        ))}
                    </optgroup>
                  </select>
                  <Button disabled={!shortcutTarget} onClick={() => void createShortcut()}>
                    Fixar
                  </Button>
                </div>
                <ul className="divide-border mt-3 divide-y">
                  {operations.shortcuts.map((shortcut, index) => (
                    <li key={shortcut.id} className="flex min-h-12 items-center gap-2 py-2">
                      <strong className="min-w-0 flex-1 truncate">
                        {shortcut.product?.name ?? shortcut.offer?.name}
                      </strong>
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={index === 0}
                        aria-label="Mover para cima"
                        onClick={() => void moveShortcut(shortcut.id, -1)}
                      >
                        <ArrowUp />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={index === operations.shortcuts.length - 1}
                        aria-label="Mover para baixo"
                        onClick={() => void moveShortcut(shortcut.id, 1)}
                      >
                        <ArrowDown />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Remover produto rápido"
                        onClick={() => void removeShortcut(shortcut.id)}
                      >
                        <Trash2 />
                      </Button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={draftsOpen} onOpenChange={setDraftsOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="bg-tinta/55 fixed inset-0 z-50" />
          <Dialog.Content className="bg-surface fixed inset-y-0 right-0 z-50 w-full max-w-md overflow-y-auto p-5 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <Dialog.Title className="text-xl font-bold">Pedidos em espera</Dialog.Title>
                <Dialog.Description className="text-text-secondary mt-1 text-sm">
                  Retome com preços e disponibilidade recalculados.
                </Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <Button variant="ghost" size="icon" aria-label="Fechar pedidos em espera">
                  <X />
                </Button>
              </Dialog.Close>
            </div>
            <div className="mt-5 space-y-2" aria-live="polite">
              {drafts.map((draft) => (
                <article key={draft.id} className="border-border rounded-xl border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <strong className="block truncate">{draft.customerName}</strong>
                      <span className="text-text-secondary block text-sm">
                        {draft.itemCount} itens ·{' '}
                        {draft.modality === 'PICKUP'
                          ? 'Retirada'
                          : draft.modality === 'DELIVERY'
                            ? 'Entrega'
                            : 'Mesa'}
                      </span>
                      <small className="text-text-secondary">
                        {draft.terminal?.name ?? 'Sem terminal'} · {draft.createdByName}
                      </small>
                    </div>
                    <Clock3 className="text-brand-600 h-4 w-4 shrink-0" />
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Button
                      className="flex-1"
                      disabled={operationState === 'loading'}
                      onClick={() => void resumeDraft(draft.id)}
                    >
                      Retomar
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Descartar pedido de ${draft.customerName}`}
                      onClick={() => void discardDraft(draft.id, draft.version)}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </article>
              ))}
              {drafts.length === 0 ? (
                <div className="border-border text-text-secondary rounded-xl border border-dashed p-6 text-center text-sm">
                  Nenhum pedido em espera.
                </div>
              ) : null}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={recentsOpen} onOpenChange={setRecentsOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="bg-tinta/55 fixed inset-0 z-50" />
          <Dialog.Content className="bg-surface fixed inset-y-0 right-0 z-50 w-full max-w-md overflow-y-auto p-5 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <Dialog.Title className="text-xl font-bold">Pedidos recentes</Dialog.Title>
                <Dialog.Description className="text-text-secondary mt-1 text-sm">
                  Últimos pedidos do PDV desta loja, sem dados de contato.
                </Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <Button variant="ghost" size="icon" aria-label="Fechar pedidos recentes">
                  <X />
                </Button>
              </Dialog.Close>
            </div>
            <div className="mt-5 space-y-2">
              {operations.recentOrders.map((order) => (
                <article key={order.id} className="border-border rounded-xl border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <strong className="block truncate">
                        #{order.orderNumber} · {order.customerName || 'Sem nome'}
                      </strong>
                      <span className="text-text-secondary text-sm">
                        {order._count.items} itens · {formatCurrency(order.total)}
                      </span>
                      <small className="text-text-secondary block">
                        {order.posTerminalLabelSnapshot ?? 'Sem terminal'} ·{' '}
                        {order.createdBy?.name ?? 'Operador'}
                      </small>
                    </div>
                    <span className="bg-kraft rounded-full px-2 py-1 text-xs font-bold">
                      {order.status}
                    </span>
                  </div>
                  <Button
                    className="mt-3 w-full"
                    variant="outline"
                    disabled={operationState === 'loading'}
                    onClick={() => void repeatRecentOrder(order.id)}
                  >
                    Repetir com preço atual
                  </Button>
                </article>
              ))}
              {operations.recentOrders.length === 0 ? (
                <div className="border-border text-text-secondary rounded-xl border border-dashed p-6 text-center text-sm">
                  Nenhum pedido recente no PDV.
                </div>
              ) : null}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <ProductDialog
        key={productDialog?.id ?? 'no-product'}
        product={productDialog}
        open={Boolean(productDialog)}
        onOpenChange={(open) => !open && setProductDialog(null)}
        onAdd={(line) => setCart((current) => [...current, line])}
      />
      <OfferDialog
        key={offerDialog?.id ?? 'no-offer'}
        offer={offerDialog}
        open={Boolean(offerDialog)}
        onOpenChange={(open) => !open && setOfferDialog(null)}
        onAdd={(line) => setCart((current) => [...current, line])}
      />
    </main>
  );
}

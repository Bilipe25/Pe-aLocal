export const CHECKOUT_DRAFT_STORAGE_KEY_PREFIX = 'pedidolocal-checkout-draft:';
export const CHECKOUT_DRAFT_TTL_MS = 30 * 60 * 1000;

export type CheckoutDraftModality = 'DELIVERY' | 'PICKUP';
export type CheckoutDraftPaymentMethod = 'PIX' | 'CASH' | 'CARD_ON_DELIVERY';

export interface CheckoutDraftAddress {
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  reference: string;
}

export interface CheckoutDraftData {
  customerName: string;
  customerPhone: string;
  modality: CheckoutDraftModality;
  paymentMethod: CheckoutDraftPaymentMethod;
  deliveryPostalCode?: string;
  address?: CheckoutDraftAddress;
  couponCode?: string;
  /** Campos v1 mantidos apenas para migração de rascunhos existentes. */
  deliveryZoneId?: string;
  deliveryAddress?: string;
}

export interface CheckoutCartHandoff {
  modality: CheckoutDraftModality;
  deliveryPostalCode?: string;
  couponCode?: string;
}

interface PersistedCheckoutDraft extends CheckoutDraftData {
  version: 1 | 2;
  expiresAt: number;
}

type CheckoutDraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isBoundedString(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.length <= maxLength;
}

function isOptionalBoundedString(value: unknown, maxLength: number) {
  return value === undefined || isBoundedString(value, maxLength);
}

function isModality(value: unknown): value is CheckoutDraftModality {
  return value === 'DELIVERY' || value === 'PICKUP';
}

function isPaymentMethod(value: unknown): value is CheckoutDraftPaymentMethod {
  return value === 'PIX' || value === 'CASH' || value === 'CARD_ON_DELIVERY';
}

function parseAddress(value: unknown): CheckoutDraftAddress | undefined | null {
  if (value === undefined) return undefined;
  if (
    !isRecord(value) ||
    !isBoundedString(value.street, 160) ||
    !isBoundedString(value.number, 30) ||
    !isBoundedString(value.complement, 120) ||
    !isBoundedString(value.neighborhood, 120) ||
    !isBoundedString(value.city, 120) ||
    !isBoundedString(value.state, 2) ||
    !isBoundedString(value.reference, 200)
  ) {
    return null;
  }
  return {
    street: value.street,
    number: value.number,
    complement: value.complement,
    neighborhood: value.neighborhood,
    city: value.city,
    state: value.state,
    reference: value.reference,
  };
}

function parseDraft(value: unknown, now: number): PersistedCheckoutDraft | null {
  if (
    !isRecord(value) ||
    (value.version !== 1 && value.version !== 2) ||
    typeof value.expiresAt !== 'number' ||
    !Number.isFinite(value.expiresAt) ||
    value.expiresAt <= now ||
    !isBoundedString(value.customerName, 100) ||
    !isBoundedString(value.customerPhone, 15) ||
    !isModality(value.modality) ||
    !isPaymentMethod(value.paymentMethod) ||
    !isOptionalBoundedString(value.deliveryPostalCode, 9) ||
    !isOptionalBoundedString(value.couponCode, 32) ||
    !isOptionalBoundedString(value.deliveryZoneId, 100) ||
    !isOptionalBoundedString(value.deliveryAddress, 500)
  ) {
    return null;
  }
  const address = parseAddress(value.address);
  if (address === null) return null;

  return {
    version: value.version,
    expiresAt: value.expiresAt,
    customerName: value.customerName,
    customerPhone: value.customerPhone,
    modality: value.modality,
    paymentMethod: value.paymentMethod,
    ...(typeof value.deliveryPostalCode === 'string'
      ? { deliveryPostalCode: value.deliveryPostalCode }
      : {}),
    ...(address ? { address } : {}),
    ...(typeof value.couponCode === 'string' ? { couponCode: value.couponCode } : {}),
    ...(typeof value.deliveryZoneId === 'string' ? { deliveryZoneId: value.deliveryZoneId } : {}),
    ...(typeof value.deliveryAddress === 'string'
      ? { deliveryAddress: value.deliveryAddress }
      : {}),
  };
}

export function getCheckoutDraftStorageKey(storeId: string) {
  return `${CHECKOUT_DRAFT_STORAGE_KEY_PREFIX}${storeId}`;
}

export function readCheckoutDraft(
  storage: CheckoutDraftStorage | null,
  storeId: string,
  now = Date.now(),
): CheckoutDraftData | null {
  if (!storage || !storeId) return null;
  const key = getCheckoutDraftStorageKey(storeId);

  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const draft = parseDraft(JSON.parse(raw) as unknown, now);
    if (!draft) {
      storage.removeItem(key);
      return null;
    }
    return {
      customerName: draft.customerName,
      customerPhone: draft.customerPhone,
      modality: draft.modality,
      paymentMethod: draft.paymentMethod,
      ...(draft.deliveryPostalCode ? { deliveryPostalCode: draft.deliveryPostalCode } : {}),
      ...(draft.address ? { address: draft.address } : {}),
      ...(draft.couponCode ? { couponCode: draft.couponCode } : {}),
      ...(draft.deliveryZoneId ? { deliveryZoneId: draft.deliveryZoneId } : {}),
      ...(draft.deliveryAddress ? { deliveryAddress: draft.deliveryAddress } : {}),
    };
  } catch {
    try {
      storage.removeItem(key);
    } catch {
      // O formulário continua funcional somente em memória.
    }
    return null;
  }
}

export function writeCheckoutDraft(
  storage: CheckoutDraftStorage | null,
  storeId: string,
  data: CheckoutDraftData,
  now = Date.now(),
) {
  if (!storage || !storeId) return;
  const draft: PersistedCheckoutDraft = {
    version: 2,
    expiresAt: now + CHECKOUT_DRAFT_TTL_MS,
    ...data,
  };

  try {
    storage.setItem(getCheckoutDraftStorageKey(storeId), JSON.stringify(draft));
  } catch {
    // Quota ou privacidade restrita não podem bloquear o checkout.
  }
}

export function writeCheckoutCartHandoff(
  storage: CheckoutDraftStorage | null,
  storeId: string,
  handoff: CheckoutCartHandoff,
  now = Date.now(),
) {
  if (!storage || !storeId) return;
  const previous = readCheckoutDraft(storage, storeId, now);
  writeCheckoutDraft(
    storage,
    storeId,
    {
      customerName: previous?.customerName ?? '',
      customerPhone: previous?.customerPhone ?? '',
      paymentMethod: previous?.paymentMethod ?? 'PIX',
      modality: handoff.modality,
      ...(handoff.modality === 'DELIVERY' && handoff.deliveryPostalCode
        ? { deliveryPostalCode: handoff.deliveryPostalCode }
        : {}),
      ...(previous?.address ? { address: previous.address } : {}),
      ...(handoff.couponCode ? { couponCode: handoff.couponCode } : {}),
    },
    now,
  );
}

export function clearCheckoutDraft(storage: CheckoutDraftStorage | null, storeId: string) {
  if (!storage || !storeId) return;
  try {
    storage.removeItem(getCheckoutDraftStorageKey(storeId));
  } catch {
    // A confirmação do pedido continua válida mesmo sem acesso ao storage.
  }
}

export const CHECKOUT_DRAFT_STORAGE_KEY_PREFIX = 'pedidolocal-checkout-draft:';
export const CHECKOUT_DRAFT_TTL_MS = 30 * 60 * 1000;

export type CheckoutDraftModality = 'DELIVERY' | 'PICKUP';
export type CheckoutDraftPaymentMethod = 'PIX' | 'CASH' | 'CARD_ON_DELIVERY';

export interface CheckoutDraftData {
  customerName: string;
  customerPhone: string;
  modality: CheckoutDraftModality;
  deliveryZoneId: string;
  deliveryAddress: string;
  paymentMethod: CheckoutDraftPaymentMethod;
}

interface PersistedCheckoutDraft extends CheckoutDraftData {
  version: 1;
  expiresAt: number;
}

type CheckoutDraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isBoundedString(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.length <= maxLength;
}

function isModality(value: unknown): value is CheckoutDraftModality {
  return value === 'DELIVERY' || value === 'PICKUP';
}

function isPaymentMethod(value: unknown): value is CheckoutDraftPaymentMethod {
  return value === 'PIX' || value === 'CASH' || value === 'CARD_ON_DELIVERY';
}

function parseDraft(value: unknown, now: number): PersistedCheckoutDraft | null {
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    typeof value.expiresAt !== 'number' ||
    !Number.isFinite(value.expiresAt) ||
    value.expiresAt <= now ||
    !isBoundedString(value.customerName, 100) ||
    !isBoundedString(value.customerPhone, 15) ||
    !isModality(value.modality) ||
    !isBoundedString(value.deliveryZoneId, 100) ||
    !isBoundedString(value.deliveryAddress, 500) ||
    !isPaymentMethod(value.paymentMethod)
  ) {
    return null;
  }

  return {
    version: 1,
    expiresAt: value.expiresAt,
    customerName: value.customerName,
    customerPhone: value.customerPhone,
    modality: value.modality,
    deliveryZoneId: value.deliveryZoneId,
    deliveryAddress: value.deliveryAddress,
    paymentMethod: value.paymentMethod,
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
      deliveryZoneId: draft.deliveryZoneId,
      deliveryAddress: draft.deliveryAddress,
      paymentMethod: draft.paymentMethod,
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
    version: 1,
    expiresAt: now + CHECKOUT_DRAFT_TTL_MS,
    ...data,
  };

  try {
    storage.setItem(getCheckoutDraftStorageKey(storeId), JSON.stringify(draft));
  } catch {
    // Quota ou privacidade restrita não podem bloquear o checkout.
  }
}

export function clearCheckoutDraft(storage: CheckoutDraftStorage | null, storeId: string) {
  if (!storage || !storeId) return;
  try {
    storage.removeItem(getCheckoutDraftStorageKey(storeId));
  } catch {
    // A confirmação do pedido continua válida mesmo sem acesso ao storage.
  }
}

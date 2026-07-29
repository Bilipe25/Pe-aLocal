export const CHECKOUT_DRAFT_STORAGE_KEY_PREFIX = 'pedidolocal-checkout-draft:';
export const CHECKOUT_DRAFT_TTL_MS = 30 * 60 * 1000;

export type CheckoutDraftStep = 'identification' | 'fulfillment' | 'payment' | 'review';
export type CheckoutDraftModality = 'DELIVERY' | 'PICKUP';
export type CheckoutDraftPaymentMethod = 'PIX' | 'CASH' | 'CARD_ON_DELIVERY';

/**
 * Rascunho deliberadamente sem PII. Nome, telefone, endereço e referências
 * opacas de reconhecimento permanecem apenas na memória da aba atual.
 */
export interface CheckoutDraftData {
  step?: CheckoutDraftStep;
  modality: CheckoutDraftModality;
  paymentMethod: CheckoutDraftPaymentMethod;
  couponCode?: string;
  deliveryZoneId?: string;
}

export interface CheckoutCartHandoff {
  modality: CheckoutDraftModality;
  couponCode?: string;
  deliveryZoneId?: string;
}

interface PersistedCheckoutDraft extends CheckoutDraftData {
  version: 3;
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

function isStep(value: unknown): value is CheckoutDraftStep {
  return (
    value === 'identification' ||
    value === 'fulfillment' ||
    value === 'payment' ||
    value === 'review'
  );
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
    value.version !== 3 ||
    typeof value.expiresAt !== 'number' ||
    !Number.isFinite(value.expiresAt) ||
    value.expiresAt <= now ||
    !isModality(value.modality) ||
    !isPaymentMethod(value.paymentMethod) ||
    (value.step !== undefined && !isStep(value.step)) ||
    !isOptionalBoundedString(value.couponCode, 32) ||
    !isOptionalBoundedString(value.deliveryZoneId, 100)
  ) {
    return null;
  }

  return {
    version: 3,
    expiresAt: value.expiresAt,
    modality: value.modality,
    paymentMethod: value.paymentMethod,
    ...(value.step ? { step: value.step } : {}),
    ...(typeof value.couponCode === 'string' ? { couponCode: value.couponCode } : {}),
    ...(typeof value.deliveryZoneId === 'string' ? { deliveryZoneId: value.deliveryZoneId } : {}),
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
      // Versões 1 e 2 continham PII e não podem ser migradas.
      storage.removeItem(key);
      return null;
    }
    return {
      modality: draft.modality,
      paymentMethod: draft.paymentMethod,
      ...(draft.step ? { step: draft.step } : {}),
      ...(draft.couponCode ? { couponCode: draft.couponCode } : {}),
      ...(draft.deliveryZoneId ? { deliveryZoneId: draft.deliveryZoneId } : {}),
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
    version: 3,
    expiresAt: now + CHECKOUT_DRAFT_TTL_MS,
    modality: data.modality,
    paymentMethod: data.paymentMethod,
    ...(data.step ? { step: data.step } : {}),
    ...(data.couponCode ? { couponCode: data.couponCode } : {}),
    ...(data.deliveryZoneId ? { deliveryZoneId: data.deliveryZoneId } : {}),
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
      step: previous?.step,
      paymentMethod: previous?.paymentMethod ?? 'PIX',
      modality: handoff.modality,
      ...(handoff.couponCode ? { couponCode: handoff.couponCode } : {}),
      ...(handoff.deliveryZoneId ? { deliveryZoneId: handoff.deliveryZoneId } : {}),
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

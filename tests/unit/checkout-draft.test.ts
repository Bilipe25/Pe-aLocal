import { describe, expect, it, vi } from 'vitest';

import {
  CHECKOUT_DRAFT_TTL_MS,
  clearCheckoutDraft,
  getCheckoutDraftStorageKey,
  readCheckoutDraft,
  writeCheckoutCartHandoff,
  writeCheckoutDraft,
  type CheckoutDraftData,
} from '@/lib/checkout/checkout-draft';

function createMemoryStorage() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
    removeItem: (key: string) => data.delete(key),
  };
}

const draft: CheckoutDraftData = {
  step: 'fulfillment',
  modality: 'DELIVERY',
  deliveryZoneId: 'zone-a',
  paymentMethod: 'PIX',
  couponCode: 'BEMVINDO10',
};

describe('rascunho não sensível do checkout', () => {
  it('persiste somente o contrato v3 namespaced por loja', () => {
    const storage = createMemoryStorage();
    writeCheckoutDraft(storage, 'store-a', draft, 1_000);

    expect(readCheckoutDraft(storage, 'store-a', 1_001)).toEqual(draft);
    expect(readCheckoutDraft(storage, 'store-b', 1_001)).toBeNull();

    const persisted = JSON.parse(storage.data.get(getCheckoutDraftStorageKey('store-a'))!);
    expect(persisted).toMatchObject({ version: 3, ...draft });
    expect(persisted).not.toHaveProperty('customerName');
    expect(persisted).not.toHaveProperty('customerPhone');
    expect(persisted).not.toHaveProperty('address');
    expect(persisted).not.toHaveProperty('deliveryPostalCode');
    expect(persisted).not.toHaveProperty('savedAddressReference');
  });

  it('descarta e remove rascunhos v1 e v2 que podiam conter PII', () => {
    const storage = createMemoryStorage();
    const key = getCheckoutDraftStorageKey('store-a');

    for (const version of [1, 2]) {
      storage.setItem(
        key,
        JSON.stringify({
          version,
          expiresAt: Date.now() + 1_000,
          customerName: 'Cliente',
          customerPhone: '(11) 99999-9999',
          address: { street: 'Rua privada' },
          modality: 'DELIVERY',
          paymentMethod: 'PIX',
        }),
      );

      expect(readCheckoutDraft(storage, 'store-a')).toBeNull();
      expect(storage.data.has(key)).toBe(false);
    }
  });

  it('expira e remove o rascunho após trinta minutos', () => {
    const storage = createMemoryStorage();
    writeCheckoutDraft(storage, 'store-a', draft, 1_000);

    expect(readCheckoutDraft(storage, 'store-a', 1_000 + CHECKOUT_DRAFT_TTL_MS)).toBeNull();
    expect(storage.data.has(getCheckoutDraftStorageKey('store-a'))).toBe(false);
  });

  it('descarta conteúdo corrompido ou fora do contrato', () => {
    const storage = createMemoryStorage();
    storage.setItem(getCheckoutDraftStorageKey('store-a'), '{"version":3,"modality":');

    expect(readCheckoutDraft(storage, 'store-a')).toBeNull();
    expect(storage.data.has(getCheckoutDraftStorageKey('store-a'))).toBe(false);
  });

  it('continua funcional quando sessionStorage está indisponível', () => {
    const storage = {
      getItem: vi.fn(() => {
        throw new Error('indisponível');
      }),
      setItem: vi.fn(() => {
        throw new Error('indisponível');
      }),
      removeItem: vi.fn(() => {
        throw new Error('indisponível');
      }),
    };

    expect(() => writeCheckoutDraft(storage, 'store-a', draft)).not.toThrow();
    expect(readCheckoutDraft(storage, 'store-a')).toBeNull();
    expect(() => clearCheckoutDraft(storage, 'store-a')).not.toThrow();
  });

  it('limpa somente o rascunho da loja informada', () => {
    const storage = createMemoryStorage();
    writeCheckoutDraft(storage, 'store-a', draft);
    writeCheckoutDraft(storage, 'store-b', { ...draft, deliveryZoneId: 'zone-b' });

    clearCheckoutDraft(storage, 'store-a');

    expect(readCheckoutDraft(storage, 'store-a')).toBeNull();
    expect(readCheckoutDraft(storage, 'store-b')).toEqual({
      ...draft,
      deliveryZoneId: 'zone-b',
    });
  });

  it('transfere somente modalidade, zona e cupom sem reintroduzir PII', () => {
    const storage = createMemoryStorage();
    writeCheckoutDraft(storage, 'store-a', draft, 1_000);

    writeCheckoutCartHandoff(
      storage,
      'store-a',
      {
        modality: 'DELIVERY',
        deliveryZoneId: 'zone-b',
        couponCode: 'NOVO10',
      },
      2_000,
    );

    expect(readCheckoutDraft(storage, 'store-a', 2_001)).toEqual({
      step: 'fulfillment',
      paymentMethod: 'PIX',
      modality: 'DELIVERY',
      deliveryZoneId: 'zone-b',
      couponCode: 'NOVO10',
    });
  });
});

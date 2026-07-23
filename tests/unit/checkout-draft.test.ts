import { describe, expect, it, vi } from 'vitest';

import {
  CHECKOUT_DRAFT_TTL_MS,
  clearCheckoutDraft,
  getCheckoutDraftStorageKey,
  readCheckoutDraft,
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
  customerName: 'Cliente',
  customerPhone: '(11) 99999-9999',
  modality: 'DELIVERY',
  deliveryZoneId: 'zone-a',
  deliveryAddress: 'Rua A, 10',
  paymentMethod: 'PIX',
};

describe('rascunho do checkout por sessão', () => {
  it('persiste e restaura somente o contrato mínimo namespaced por loja', () => {
    const storage = createMemoryStorage();
    writeCheckoutDraft(storage, 'store-a', draft, 1_000);

    expect(readCheckoutDraft(storage, 'store-a', 1_001)).toEqual(draft);
    expect(readCheckoutDraft(storage, 'store-b', 1_001)).toBeNull();

    const persisted = JSON.parse(storage.data.get(getCheckoutDraftStorageKey('store-a'))!);
    expect(persisted).not.toHaveProperty('notes');
    expect(persisted).not.toHaveProperty('changeFor');
    expect(persisted).not.toHaveProperty('storeSlug');
  });

  it('expira e remove o rascunho após trinta minutos', () => {
    const storage = createMemoryStorage();
    writeCheckoutDraft(storage, 'store-a', draft, 1_000);

    expect(readCheckoutDraft(storage, 'store-a', 1_000 + CHECKOUT_DRAFT_TTL_MS)).toBeNull();
    expect(storage.data.has(getCheckoutDraftStorageKey('store-a'))).toBe(false);
  });

  it('descarta conteúdo corrompido ou fora do contrato', () => {
    const storage = createMemoryStorage();
    storage.setItem(getCheckoutDraftStorageKey('store-a'), '{"version":1,"customerName":');

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
});

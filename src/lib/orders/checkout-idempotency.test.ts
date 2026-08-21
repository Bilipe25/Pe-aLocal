import { describe, expect, it } from 'vitest';

import { clearCheckoutIdempotency, resolveCheckoutIdempotency } from './checkout-idempotency';
import type { CheckoutFingerprintInput } from './order-idempotency';

const payload: CheckoutFingerprintInput = {
  identityMode: 'VISITOR',
  customerName: 'Cliente',
  customerPhone: '(85) 99999-9999',
  modality: 'PICKUP',
  saveCustomerData: true,
  addressLabel: 'HOME',
  setAddressAsDefault: false,
  paymentMethod: 'PIX',
  notes: '',
  items: [
    {
      productId: 'd665460d-b4be-48e6-8cb2-33ab2e5cc8a1',
      quantity: 1,
      notes: '',
      optionIds: ['3d78178d-af83-4a72-8215-dcb24d3df903', 'fdd28ba4-e805-48a7-89db-f374ee985109'],
    },
  ],
};

function firstProductItem() {
  const item = payload.items[0];
  if (!item || item.kind === 'COMBO') throw new Error('Produto de teste ausente.');
  return item;
}

function createStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    values,
  };
}

describe('checkout idempotency', () => {
  it('reuses the key for the same payload across retries and reloads', async () => {
    const storage = createStorage();
    const first = await resolveCheckoutIdempotency(payload, storage, 'checkout', null);
    const retry = await resolveCheckoutIdempotency(payload, storage, 'checkout', first);
    const reload = await resolveCheckoutIdempotency(payload, storage, 'checkout', null);

    expect(retry.key).toBe(first.key);
    expect(reload.key).toBe(first.key);
  });

  it('does not persist or derive the browser key from customer PII', async () => {
    const storage = createStorage();
    const first = await resolveCheckoutIdempotency(payload, storage, 'checkout', null);
    const changed = await resolveCheckoutIdempotency(
      { ...payload, customerName: 'Outra pessoa' },
      storage,
      'checkout',
      first,
    );

    expect(changed.key).toBe(first.key);
    expect(changed.fingerprint).toBe(first.fingerprint);
  });

  it('reuses the key when only item and option ordering changes', async () => {
    const secondItem = {
      productId: '4a336c45-d6d2-4a34-82b0-5f458f20fb92',
      quantity: 2,
      notes: '',
      optionIds: [] as string[],
    };
    const ordered = { ...payload, items: [...payload.items, secondItem] };
    const reordered = {
      ...payload,
      items: [
        secondItem,
        { ...firstProductItem(), optionIds: [...firstProductItem().optionIds].reverse() },
      ],
    };
    const storage = createStorage();
    const first = await resolveCheckoutIdempotency(ordered, storage, 'checkout', null);
    const retry = await resolveCheckoutIdempotency(reordered, storage, 'checkout', null);

    expect(retry.key).toBe(first.key);
  });

  it('removes the persisted record after success', async () => {
    const storage = createStorage();
    await resolveCheckoutIdempotency(payload, storage, 'checkout', null);

    clearCheckoutIdempotency(storage, 'checkout');

    expect(storage.values.has('checkout')).toBe(false);
  });
});

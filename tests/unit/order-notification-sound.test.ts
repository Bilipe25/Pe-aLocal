import { describe, expect, it } from 'vitest';

import {
  readOrderSoundPreference,
  writeOrderSoundPreference,
} from '@/hooks/use-order-notification-sound';

function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

describe('order sound preference', () => {
  it('inicia desligada e persiste somente opt-in explícito por escopo', () => {
    const localStorage = storage();

    expect(readOrderSoundPreference(localStorage, 'user-a:store-a')).toBe(false);
    writeOrderSoundPreference(localStorage, 'user-a:store-a', true);
    expect(readOrderSoundPreference(localStorage, 'user-a:store-a')).toBe(true);
    expect(readOrderSoundPreference(localStorage, 'user-b:store-a')).toBe(false);
  });

  it('remove a preferência ao desligar', () => {
    const localStorage = storage();
    writeOrderSoundPreference(localStorage, 'user-a:store-a', true);

    writeOrderSoundPreference(localStorage, 'user-a:store-a', false);

    expect(readOrderSoundPreference(localStorage, 'user-a:store-a')).toBe(false);
  });
});

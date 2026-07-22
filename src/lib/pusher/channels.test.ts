import { describe, expect, it } from 'vitest';

import { privateStoreChannel, storeEventChannels } from './channels';

describe('Pusher store channels', () => {
  it('usa somente canal privado por padrão', () => {
    expect(privateStoreChannel('store-a')).toBe('private-store-store-a');
    expect(storeEventChannels('store-a', false)).toBe('private-store-store-a');
  });

  it('inclui canal público somente durante rollout explícito', () => {
    expect(storeEventChannels('store-a', true)).toEqual([
      'private-store-store-a',
      'store-store-a',
    ]);
  });
});

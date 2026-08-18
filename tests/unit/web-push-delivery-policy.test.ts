import { describe, expect, it } from 'vitest';

import {
  getWebPushRetryDelaySeconds,
  WEB_PUSH_DELIVERY_LEASE_MS,
  WEB_PUSH_MAX_DELIVERY_ATTEMPTS,
} from '@/server/services/web-push-delivery-policy';

describe('política compartilhada de delivery Web Push', () => {
  it('mantém cinco tentativas, lease de dois minutos e backoff limitado', () => {
    expect(WEB_PUSH_MAX_DELIVERY_ATTEMPTS).toBe(5);
    expect(WEB_PUSH_DELIVERY_LEASE_MS).toBe(120_000);
    expect([1, 2, 3, 4, 5, 20].map(getWebPushRetryDelaySeconds)).toEqual([5, 10, 20, 40, 80, 300]);
  });
});

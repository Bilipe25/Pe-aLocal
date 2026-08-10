import { describe, expect, it } from 'vitest';

import { isAllowedWebPushEndpoint, webPushSubscriptionInputSchema } from '@/schemas/web-push';

const p256dh = Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 1)]).toString('base64url');
const auth = Buffer.alloc(16, 2).toString('base64url');

describe('Web Push subscription schema', () => {
  it.each([
    'https://fcm.googleapis.com/fcm/send/id',
    'https://updates.push.services.mozilla.com/wpush/v2/id',
    'https://web.push.apple.com/QH-id',
  ])('aceita o provedor público %s', (endpoint) => {
    expect(isAllowedWebPushEndpoint(endpoint)).toBe(true);
    expect(
      webPushSubscriptionInputSchema.safeParse({ endpoint, keys: { p256dh, auth } }).success,
    ).toBe(true);
  });

  it.each([
    'http://fcm.googleapis.com/id',
    'https://localhost/push',
    'https://127.0.0.1/push',
    'https://attacker.example/push',
    'https://user:pass@fcm.googleapis.com/push',
  ])('recusa endpoint inseguro %s', (endpoint) => {
    expect(isAllowedWebPushEndpoint(endpoint)).toBe(false);
  });

  it('recusa chaves com dimensões inválidas', () => {
    expect(
      webPushSubscriptionInputSchema.safeParse({
        endpoint: 'https://fcm.googleapis.com/fcm/send/id',
        keys: { p256dh: 'AA', auth: 'AA' },
      }).success,
    ).toBe(false);
  });
});

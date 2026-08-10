import { describe, expect, it } from 'vitest';

import { readWebPushSenderConfig, webPushFailure } from '@/server/services/web-push-sender';

describe('Web Push sender', () => {
  it('falha aberto sem configuração completa', () => {
    expect(readWebPushSenderConfig({ WEB_PUSH_ENABLED: 'false' })).toBeNull();
    expect(readWebPushSenderConfig({ WEB_PUSH_ENABLED: 'true' })).toBeNull();
  });

  it.each([404, 410])('classifica %s como revogação lógica', (statusCode) => {
    expect(webPushFailure({ statusCode, message: 'gone' })).toMatchObject({
      statusCode,
      revoked: true,
      transient: false,
    });
  });

  it('classifica throttling sem persistir a mensagem potencialmente sensível', () => {
    expect(
      webPushFailure({
        statusCode: 429,
        headers: { 'retry-after': '30' },
        message: 'linha\nsegredo',
      }),
    ).toMatchObject({ transient: true, retryAfterSeconds: 30, message: 'push_http_429' });
  });
});

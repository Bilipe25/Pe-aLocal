import { describe, expect, it } from 'vitest';

import { readWebPushSenderConfig, webPushFailure } from '@/server/services/web-push-sender';

describe('Web Push sender', () => {
  it('falha aberto sem configuração completa', () => {
    expect(readWebPushSenderConfig({ WEB_PUSH_ENABLED: 'false' })).toBeNull();
    expect(readWebPushSenderConfig({ WEB_PUSH_ENABLED: 'true' })).toBeNull();
  });

  it('permite habilitar o sender operacional sem habilitar o consumidor', () => {
    expect(
      readWebPushSenderConfig(
        {
          WEB_PUSH_ENABLED: 'false',
          WEB_PUSH_VAPID_PUBLIC_KEY: 'A'.repeat(87),
          WEB_PUSH_VAPID_PRIVATE_KEY: 'B'.repeat(43),
          WEB_PUSH_VAPID_SUBJECT: 'mailto:operacoes@pedidolocal.test',
        },
        true,
      ),
    ).toMatchObject({ subject: 'mailto:operacoes@pedidolocal.test' });
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

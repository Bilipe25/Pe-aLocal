import { describe, expect, it } from 'vitest';

import {
  STORE_FEATURE_DEFINITIONS,
  isStoreFeatureAvailable,
} from '@/domain/entitlements/store-features';
import {
  createPkceChallenge,
  decryptCredential,
  encryptCredential,
} from '@/lib/mercado-pago/crypto';
import { mercadoPagoWebhookSchema } from '@/lib/mercado-pago/schemas';
import { validateMercadoPagoSignature } from '@/lib/mercado-pago/signature';
import { mapMercadoPagoOrderStatus } from '@/lib/mercado-pago/status-mapper';

function base64(bytes: Uint8Array) {
  return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''));
}

async function hmacHex(secret: string, value: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const digest = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value)));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

describe('Mercado Pago core', () => {
  it('gera PKCE S256 conforme o vetor oficial', async () => {
    await expect(createPkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).resolves.toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    );
  });

  it('criptografa com AES-GCM e vincula a credencial ao AAD', async () => {
    const key = base64(crypto.getRandomValues(new Uint8Array(32)));
    const encrypted = await encryptCredential('segredo', key, 'tenant:store:access:1');

    await expect(decryptCredential(encrypted, key, 'tenant:store:access:1')).resolves.toBe(
      'segredo',
    );
    await expect(
      decryptCredential(encrypted, key, 'outro-tenant:store:access:1'),
    ).rejects.toBeDefined();
  });

  it('valida assinatura e rejeita timestamp vencido', async () => {
    const secret = 'webhook-secret';
    const requestId = 'request-1';
    const dataId = 'ORDER-123';
    const now = Date.now();
    const ts = String(Math.floor(now / 1_000));
    const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`;
    const signature = `ts=${ts},v1=${await hmacHex(secret, manifest)}`;

    await expect(
      validateMercadoPagoSignature({ signature, requestId, dataId, secret, now }),
    ).resolves.toBe(true);
    await expect(
      validateMercadoPagoSignature({
        signature,
        requestId,
        dataId,
        secret,
        now: now + 301_000,
      }),
    ).resolves.toBe(false);
  });

  it('mantém status desconhecido em revisão e nunca o promove a pago', () => {
    expect(mapMercadoPagoOrderStatus('processed', 'accredited')).toBe('PAID');
    expect(mapMercadoPagoOrderStatus('action_required', 'waiting_payment')).toBe('PENDING');
    expect(mapMercadoPagoOrderStatus('charged_back', 'settled')).toBe('REVIEW');
  });

  it('aceita apenas o contrato estrito do webhook', () => {
    const webhook = {
      id: 42,
      live_mode: false,
      type: 'order',
      action: 'order.action_required',
      user_id: 10,
      application_id: 76506430185983,
      api_version: 'v1',
      date_created: '2026-08-17T22:37:39.000Z',
      data: { id: 'order-1' },
    };
    expect(mercadoPagoWebhookSchema.parse(webhook)).toMatchObject({
      id: '42',
      type: 'order',
      user_id: '10',
      application_id: '76506430185983',
    });
    expect(mercadoPagoWebhookSchema.safeParse({ ...webhook, token: 'não permitido' }).success).toBe(
      false,
    );
  });
});

describe('store feature definitions', () => {
  const flags = {
    onlinePaymentsEnabled: true,
    operationalSlaEnabled: true,
    kdsEnabled: true,
    advancedReportsEnabled: true,
    orderPrintingEnabled: true,
  };

  it('expõe somente recursos realmente implementados como disponíveis', () => {
    expect(isStoreFeatureAvailable(flags, 'onlinePayments')).toBe(true);
    expect(isStoreFeatureAvailable(flags, 'operationalSla')).toBe(true);
    expect(isStoreFeatureAvailable(flags, 'kds')).toBe(true);
    expect(isStoreFeatureAvailable(flags, 'advancedReports')).toBe(false);
    expect(STORE_FEATURE_DEFINITIONS.orderPrinting.implementationStatus).toBe('COMING_SOON');
  });
});

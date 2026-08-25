import { afterEach, describe, expect, it, vi } from 'vitest';

import { consumerVerificationRequestSchema } from '@/schemas/consumer-auth';
import {
  getConsumerVerificationProvider,
  getConsumerVerificationProviderByName,
} from '@/server/consumer-verification/provider';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('consumer verification provider', () => {
  it('derives the phone from an authorized order claim but still requires it for login', () => {
    expect(
      consumerVerificationRequestSchema.safeParse({
        purpose: 'ORDER_CLAIM',
        trackingToken: '4da03571-bffd-45ef-8c44-20686c487838',
      }).success,
    ).toBe(true);
    expect(consumerVerificationRequestSchema.safeParse({ purpose: 'LOGIN' }).success).toBe(false);
  });

  it('fails closed when no provider is configured', async () => {
    vi.stubEnv('CONSUMER_VERIFICATION_PROVIDER', 'disabled');
    const provider = getConsumerVerificationProvider();

    expect(provider.name).toBe('disabled');
    expect(provider.isReady()).toBe(false);
    await expect(provider.start('5585999999999')).rejects.toThrow(
      'A confirmação por celular está temporariamente indisponível.',
    );
  });

  it('allows the fixed code only in local development', async () => {
    vi.stubEnv('CONSUMER_VERIFICATION_PROVIDER', 'development');
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('APP_ENV', 'local');
    const provider = getConsumerVerificationProvider();

    expect(provider.isReady()).toBe(true);
    const started = await provider.start('5585999999999');
    expect(started).toMatchObject({ provider: 'development' });
    await expect(provider.verify('5585999999999', '000000')).resolves.toEqual({
      verified: true,
      terminal: false,
    });
    await expect(provider.verify('5585999999999', '123456')).resolves.toEqual({
      verified: false,
      terminal: false,
    });
  });

  it('blocks the development provider in a deployed runtime', async () => {
    vi.stubEnv('CONSUMER_VERIFICATION_PROVIDER', 'development');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('APP_ENV', 'staging');
    const provider = getConsumerVerificationProvider();

    expect(provider.isReady()).toBe(false);
    await expect(provider.start('5585999999999')).rejects.toThrow(
      'A confirmação por celular está temporariamente indisponível.',
    );
  });

  it('uses the current regional Bird Verify API with SMS only and no verification id', async () => {
    vi.stubEnv('CONSUMER_VERIFICATION_PROVIDER', 'bird');
    vi.stubEnv('BIRD_API_KEY', 'bk_us1_Ab3xKq9mP2wR5tY8uI1oL4nJ2kQ9m');
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ status: 'pending', expires_at: '2026-08-24T22:00:00.000Z' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, verification: { status: 'verified' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const provider = getConsumerVerificationProvider();

    const started = await provider.start('5585999999999');
    expect(started).toEqual({
      provider: 'bird',
      expiresAt: new Date('2026-08-24T22:00:00.000Z'),
    });
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://us1.platform.bird.com/v1/verify/verifications',
    );
    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({
      Authorization: 'Bearer bk_us1_Ab3xKq9mP2wR5tY8uI1oL4nJ2kQ9m',
    });
    const startBody = JSON.parse(fetchMock.mock.calls[0][1].body as string) as Record<
      string,
      unknown
    >;
    expect(startBody).toMatchObject({
      to: { phone_number: '+5585999999999' },
      options: { code_length: 6, channels: ['sms'] },
    });
    expect(startBody).not.toHaveProperty('code');
    await expect(provider.verify('5585999999999', '654321')).resolves.toEqual({
      verified: true,
      terminal: true,
    });
    expect(fetchMock.mock.calls[1][0]).toBe(
      'https://us1.platform.bird.com/v1/verify/verifications/check',
    );
    expect(JSON.parse(fetchMock.mock.calls[1][1].body as string)).toEqual({
      to: { phone_number: '+5585999999999' },
      code: '654321',
    });
  });

  it('maps Bird wrong-code and terminal outcomes without treating them as transport errors', async () => {
    vi.stubEnv('CONSUMER_VERIFICATION_PROVIDER', 'bird');
    vi.stubEnv('BIRD_API_KEY', 'bk_eu1_Ab3xKq9mP2wR5tY8uI1oL4nJ2kQ9m');
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: false,
            reason: 'incorrect_code',
            attempts_remaining: 4,
            verification: { status: 'pending' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: false,
            reason: 'attempts_exhausted',
            attempts_remaining: 0,
            verification: { status: 'failed' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);
    const provider = getConsumerVerificationProvider();

    await expect(provider.verify('5585999999999', '111111')).resolves.toEqual({
      verified: false,
      terminal: false,
    });
    await expect(provider.verify('5585999999999', '222222')).resolves.toEqual({
      verified: false,
      terminal: true,
    });
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://eu1.platform.bird.com/v1/verify/verifications/check',
    );
  });

  it('respects Bird Retry-After without automatically sending another request', async () => {
    vi.stubEnv('CONSUMER_VERIFICATION_PROVIDER', 'bird');
    vi.stubEnv('BIRD_API_KEY', 'bk_us1_Ab3xKq9mP2wR5tY8uI1oL4nJ2kQ9m');
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ type: 'rate_limit_error' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json', 'Retry-After': '60' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(getConsumerVerificationProvider().start('5585999999999')).rejects.toThrow(
      'Aguarde 60 segundos para tentar novamente.',
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('ignores the three legacy credentials and requires a current regional API key', () => {
    vi.stubEnv('CONSUMER_VERIFICATION_PROVIDER', 'bird');
    vi.stubEnv('BIRD_API_KEY', '');
    vi.stubEnv('BIRD_ACCESS_KEY', 'legacy-access-key');
    vi.stubEnv('BIRD_WORKSPACE_ID', 'legacy-workspace');
    vi.stubEnv('BIRD_VERIFY_NAVIGATOR_ID', 'legacy-navigator');

    expect(getConsumerVerificationProvider().isReady()).toBe(false);
  });

  it('does not restore a challenge through a differently configured provider', () => {
    vi.stubEnv('CONSUMER_VERIFICATION_PROVIDER', 'bird');
    expect(getConsumerVerificationProviderByName('development').name).toBe('disabled');
  });
});

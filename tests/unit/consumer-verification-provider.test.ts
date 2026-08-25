import { afterEach, describe, expect, it, vi } from 'vitest';

import { consumerVerificationRequestSchema } from '@/schemas/consumer-auth';
import {
  getConsumerVerificationProvider,
  getConsumerVerificationProviderByName,
  renderConsumerVerificationEmail,
  type ConsumerVerificationStartInput,
} from '@/server/consumer-verification/provider';

function phoneStart(phone = '5585999999999'): ConsumerVerificationStartInput {
  return {
    subject: { kind: 'phone', normalized: phone },
    storeName: 'Loja Teste',
    idempotencyKey: 'consumer-otp/test-phone',
  };
}

function emailStart(code = '482193'): ConsumerVerificationStartInput {
  return {
    subject: { kind: 'email', normalized: 'cliente@example.com' },
    storeName: 'Loja <Teste>',
    idempotencyKey: 'consumer-otp/test-email',
    code,
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('consumer verification provider', () => {
  it('accepts normalized email login and keeps order claims server-derived', () => {
    expect(
      consumerVerificationRequestSchema.parse({
        purpose: 'LOGIN',
        email: '  Cliente@Example.COM ',
      }),
    ).toMatchObject({ email: 'cliente@example.com' });
    expect(
      consumerVerificationRequestSchema.safeParse({
        purpose: 'ORDER_CLAIM',
        trackingToken: '4da03571-bffd-45ef-8c44-20686c487838',
      }).success,
    ).toBe(true);
    expect(consumerVerificationRequestSchema.safeParse({ purpose: 'LOGIN' }).success).toBe(false);
  });

  it('rejects invalid, oversized, Unicode and ambiguous email identifiers', () => {
    expect(
      consumerVerificationRequestSchema.safeParse({ purpose: 'LOGIN', email: 'sem-arroba' })
        .success,
    ).toBe(false);
    expect(
      consumerVerificationRequestSchema.safeParse({
        purpose: 'LOGIN',
        email: `${'a'.repeat(245)}@example.com`,
      }).success,
    ).toBe(false);
    expect(
      consumerVerificationRequestSchema.safeParse({
        purpose: 'LOGIN',
        email: 'cliénte@example.com',
      }).success,
    ).toBe(false);
    expect(
      consumerVerificationRequestSchema.safeParse({
        purpose: 'LOGIN',
        email: 'cliente@example.com',
        phone: '(11) 99999-9999',
      }).success,
    ).toBe(false);
  });

  it('fails closed when no provider is configured', async () => {
    vi.stubEnv('CONSUMER_VERIFICATION_PROVIDER', 'disabled');
    const provider = getConsumerVerificationProvider();

    expect(provider.name).toBe('disabled');
    expect(provider.isReady()).toBe(false);
    await expect(provider.start(emailStart())).rejects.toThrow(
      'Não conseguimos enviar o código agora.',
    );
  });

  it('keeps the deterministic code strictly in local development', async () => {
    vi.stubEnv('CONSUMER_VERIFICATION_PROVIDER', 'development');
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('APP_ENV', 'development');
    const provider = getConsumerVerificationProvider();

    expect(provider.isReady()).toBe(true);
    expect(provider.method).toBe('email');
    expect(provider.ownsCode).toBe(false);
    await expect(provider.start(emailStart('000000'))).resolves.toMatchObject({
      provider: 'development',
    });
    await expect(provider.start(emailStart('123456'))).rejects.toThrow(
      'Não conseguimos enviar o código agora.',
    );
  });

  it('blocks the development provider in a deployed runtime', async () => {
    vi.stubEnv('CONSUMER_VERIFICATION_PROVIDER', 'development');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('APP_ENV', 'staging');
    const provider = getConsumerVerificationProvider();

    expect(provider.isReady()).toBe(false);
    await expect(provider.start(emailStart('000000'))).rejects.toThrow(
      'Não conseguimos enviar o código agora.',
    );
  });

  it('sends the PedidoLocal-owned OTP through Resend with a PII-free idempotency key', async () => {
    vi.stubEnv('CONSUMER_VERIFICATION_PROVIDER', 'resend');
    vi.stubEnv('RESEND_API_KEY', 're_1234567890abcdefghijklmnop');
    vi.stubEnv('RESEND_FROM_EMAIL', 'PedidoLocal <acesso@updates.example.com>');
    vi.stubEnv('CONSUMER_VERIFICATION_OTP_SECRET', 'a-secure-test-secret-with-32-characters');
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'email_123' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const provider = getConsumerVerificationProvider();
    await expect(provider.start(emailStart())).resolves.toMatchObject({ provider: 'resend' });
    expect(provider.method).toBe('email');
    expect(provider.ownsCode).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.resend.com/emails');
    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({
      Authorization: 'Bearer re_1234567890abcdefghijklmnop',
      'Idempotency-Key': 'consumer-otp/test-email',
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string) as Record<string, unknown>;
    expect(body).toMatchObject({
      from: 'PedidoLocal <acesso@updates.example.com>',
      to: ['cliente@example.com'],
      subject: 'Seu código de acesso — Loja <Teste>',
    });
    expect(body.html).toContain('482193');
    expect(body.html).toContain('Loja &lt;Teste&gt;');
    expect(body.text).toContain('Ele expira em 10 minutos.');
    expect(JSON.stringify(body)).not.toContain('a-secure-test-secret');
    expect(body).not.toHaveProperty('phone');
  });

  it('fails Resend closed on rate limiting and never retries automatically', async () => {
    vi.stubEnv('CONSUMER_VERIFICATION_PROVIDER', 'resend');
    vi.stubEnv('RESEND_API_KEY', 're_1234567890abcdefghijklmnop');
    vi.stubEnv('RESEND_FROM_EMAIL', 'acesso@updates.example.com');
    vi.stubEnv('CONSUMER_VERIFICATION_OTP_SECRET', 'a-secure-test-secret-with-32-characters');
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 429 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getConsumerVerificationProvider().start(emailStart())).rejects.toThrow(
      'Não conseguimos enviar o código agora.',
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('renders a minimal accessible HTML and plain-text email', () => {
    const email = renderConsumerVerificationEmail({
      storeName: 'Loja\nPrivada',
      code: '123456',
    });
    expect(email.subject).toBe('Seu código de acesso — Loja Privada');
    expect(email.html).toContain('123456');
    expect(email.text).toContain('123456');
    expect(email.html).not.toContain('<img');
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

    const started = await provider.start(phoneStart());
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
    await expect(
      provider.verify({ kind: 'phone', normalized: '5585999999999' }, '654321'),
    ).resolves.toEqual({ verified: true, terminal: true });
  });

  it('maps Bird wrong-code and terminal outcomes without transport leakage', async () => {
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
    const phone = { kind: 'phone', normalized: '5585999999999' } as const;

    await expect(provider.verify(phone, '111111')).resolves.toEqual({
      verified: false,
      terminal: false,
    });
    await expect(provider.verify(phone, '222222')).resolves.toEqual({
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

    await expect(getConsumerVerificationProvider().start(phoneStart())).rejects.toThrow(
      'Aguarde 60 segundos para tentar novamente.',
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('ignores the three legacy Bird credentials', () => {
    vi.stubEnv('CONSUMER_VERIFICATION_PROVIDER', 'bird');
    vi.stubEnv('BIRD_API_KEY', '');
    vi.stubEnv('BIRD_ACCESS_KEY', 'legacy-access-key');
    vi.stubEnv('BIRD_WORKSPACE_ID', 'legacy-workspace');
    vi.stubEnv('BIRD_VERIFY_NAVIGATOR_ID', 'legacy-navigator');

    expect(getConsumerVerificationProvider().isReady()).toBe(false);
  });

  it('does not restore a pending challenge through a differently configured provider', () => {
    vi.stubEnv('CONSUMER_VERIFICATION_PROVIDER', 'resend');
    expect(getConsumerVerificationProviderByName('bird').name).toBe('disabled');
  });
});

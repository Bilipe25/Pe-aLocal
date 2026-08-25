import 'server-only';

import { randomUUID } from 'node:crypto';

import { BusinessRuleError, RateLimitError } from '@/server/errors';
import { isDeployedRuntime } from '@/server/runtime-environment';

const BIRD_VERIFY_TIMEOUT_SECONDS = 5 * 60;
const EMAIL_VERIFY_TIMEOUT_SECONDS = 10 * 60;
const BIRD_KEY_PATTERN = /^bk_([a-z]{2}[0-9]+)_[A-Za-z0-9]{20,}$/u;
const RESEND_KEY_PATTERN = /^re_[A-Za-z0-9_-]{16,}$/u;

export type ConsumerVerificationProviderName = 'bird' | 'resend' | 'development' | 'disabled';
export type ConsumerVerificationMethod = 'phone' | 'email';
export type ConsumerVerificationSubject =
  { kind: 'phone'; normalized: string } | { kind: 'email'; normalized: string };

export interface ConsumerVerificationStartInput {
  subject: ConsumerVerificationSubject;
  storeName: string;
  idempotencyKey: string;
  code?: string;
}

export interface ConsumerVerificationStartResult {
  provider: Exclude<ConsumerVerificationProviderName, 'disabled'>;
  expiresAt: Date;
}

export interface ConsumerVerificationResult {
  verified: boolean;
  terminal: boolean;
}

export interface ConsumerVerificationProvider {
  readonly name: ConsumerVerificationProviderName;
  readonly method: ConsumerVerificationMethod;
  readonly ownsCode: boolean;
  isReady(): boolean;
  start(input: ConsumerVerificationStartInput): Promise<ConsumerVerificationStartResult>;
  verify(subject: ConsumerVerificationSubject, code: string): Promise<ConsumerVerificationResult>;
  resend(input: ConsumerVerificationStartInput): Promise<ConsumerVerificationStartResult>;
}

function unavailable() {
  return new BusinessRuleError(
    'Não conseguimos enviar o código agora. Tente novamente em alguns minutos.',
  );
}

function localExpiry(seconds: number) {
  return new Date(Date.now() + seconds * 1_000);
}

class DisabledProvider implements ConsumerVerificationProvider {
  readonly name = 'disabled' as const;
  readonly method = 'email' as const;
  readonly ownsCode = false;
  isReady() {
    return false;
  }
  async start(): Promise<ConsumerVerificationStartResult> {
    throw unavailable();
  }
  async verify(): Promise<ConsumerVerificationResult> {
    throw unavailable();
  }
  async resend(): Promise<ConsumerVerificationStartResult> {
    throw unavailable();
  }
}

class DevelopmentProvider implements ConsumerVerificationProvider {
  readonly name = 'development' as const;
  readonly method = 'email' as const;
  readonly ownsCode = false;
  isReady() {
    return (
      !isDeployedRuntime() &&
      (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test')
    );
  }
  async start(input: ConsumerVerificationStartInput): Promise<ConsumerVerificationStartResult> {
    if (!this.isReady()) throw unavailable();
    if (input.subject.kind !== 'email' || input.code !== '000000') throw unavailable();
    return { provider: this.name, expiresAt: localExpiry(EMAIL_VERIFY_TIMEOUT_SECONDS) };
  }
  async verify(): Promise<ConsumerVerificationResult> {
    if (!this.isReady()) throw unavailable();
    throw new BusinessRuleError('A confirmação local deve ser validada pelo PedidoLocal.');
  }
  async resend(input: ConsumerVerificationStartInput): Promise<ConsumerVerificationStartResult> {
    return this.start(input);
  }
}

function parseResendConfig() {
  const apiKey = process.env.RESEND_API_KEY?.trim() ?? '';
  const from = process.env.RESEND_FROM_EMAIL?.trim() ?? '';
  const otpSecret = process.env.CONSUMER_VERIFICATION_OTP_SECRET?.trim() ?? '';
  if (
    !RESEND_KEY_PATTERN.test(apiKey) ||
    from.length < 3 ||
    from.length > 320 ||
    /[\r\n]/u.test(from) ||
    !from.includes('@') ||
    otpSecret.length < 32
  ) {
    return null;
  }
  return { apiKey, from };
}

function safeStoreName(value: string) {
  const normalized = value
    .replace(/[\r\n\t]+/gu, ' ')
    .replace(/\s{2,}/gu, ' ')
    .trim();
  return normalized.slice(0, 80) || 'PedidoLocal';
}

function escapeHtml(value: string) {
  return value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&#039;');
}

export function renderConsumerVerificationEmail(input: { storeName: string; code: string }) {
  const storeName = safeStoreName(input.storeName);
  const escapedStoreName = escapeHtml(storeName);
  const subject = `Seu código de acesso — ${storeName}`;
  const text = `${storeName}\n\nSeu código é:\n\n${input.code}\n\nEle expira em 10 minutos.\n\nSe você não solicitou esse acesso, ignore este e-mail.`;
  const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f6f7f9;color:#171717;font-family:Arial,sans-serif"><div style="max-width:520px;margin:0 auto;padding:32px 16px"><div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:28px"><p style="margin:0 0 24px;font-size:18px;font-weight:700">${escapedStoreName}</p><p style="margin:0 0 12px;font-size:16px">Seu código é:</p><p style="margin:0 0 20px;font-size:32px;font-weight:700;letter-spacing:0.18em;color:#111827">${input.code}</p><p style="margin:0 0 12px;font-size:14px;line-height:1.5;color:#4b5563">Ele expira em 10 minutos.</p><p style="margin:0;font-size:14px;line-height:1.5;color:#4b5563">Se você não solicitou esse acesso, ignore este e-mail.</p></div></div></body></html>`;
  return { subject, text, html };
}

class ResendProvider implements ConsumerVerificationProvider {
  readonly name = 'resend' as const;
  readonly method = 'email' as const;
  readonly ownsCode = false;

  isReady() {
    return parseResendConfig() !== null;
  }

  async start(input: ConsumerVerificationStartInput): Promise<ConsumerVerificationStartResult> {
    const config = parseResendConfig();
    if (!config || input.subject.kind !== 'email' || !/^\d{6}$/u.test(input.code ?? '')) {
      throw unavailable();
    }
    const email = renderConsumerVerificationEmail({
      storeName: input.storeName,
      code: input.code ?? '',
    });
    let response: Response;
    try {
      response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Idempotency-Key': input.idempotencyKey,
        },
        body: JSON.stringify({
          from: config.from,
          to: [input.subject.normalized],
          subject: email.subject,
          html: email.html,
          text: email.text,
        }),
        signal: AbortSignal.timeout(10_000),
        cache: 'no-store',
      });
    } catch {
      throw unavailable();
    }
    if (response.status === 429) throw new RateLimitError(unavailable().message);
    if (!response.ok) throw unavailable();
    return { provider: this.name, expiresAt: localExpiry(EMAIL_VERIFY_TIMEOUT_SECONDS) };
  }

  async verify(): Promise<ConsumerVerificationResult> {
    throw new BusinessRuleError('O código de e-mail deve ser validado pelo PedidoLocal.');
  }

  async resend(input: ConsumerVerificationStartInput): Promise<ConsumerVerificationStartResult> {
    return this.start(input);
  }
}

type BirdVerification = {
  status?: unknown;
  reason?: unknown;
  expires_at?: unknown;
};

type BirdCheck = {
  success?: unknown;
  reason?: unknown;
  attempts_remaining?: unknown;
  verification?: BirdVerification;
};

function parseBirdConfig() {
  const apiKey = process.env.BIRD_API_KEY?.trim() ?? '';
  const match = BIRD_KEY_PATTERN.exec(apiKey);
  if (!match) return null;
  return { apiKey, baseUrl: `https://${match[1]}.platform.bird.com` };
}

function parseExpiry(value: unknown) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
    ? new Date(value)
    : localExpiry(BIRD_VERIFY_TIMEOUT_SECONDS);
}

class BirdProvider implements ConsumerVerificationProvider {
  readonly name = 'bird' as const;
  readonly method = 'phone' as const;
  readonly ownsCode = true;

  isReady() {
    return parseBirdConfig() !== null;
  }

  private async request(path: string, body: unknown) {
    const config = parseBirdConfig();
    if (!config) throw unavailable();
    let response: Response;
    try {
      response = await fetch(`${config.baseUrl}${path}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Idempotency-Key': randomUUID(),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
        cache: 'no-store',
      });
    } catch {
      throw unavailable();
    }
    const payload = (await response.json().catch(() => null)) as
      BirdVerification | BirdCheck | null;
    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      const seconds = retryAfter && /^[0-9]+$/u.test(retryAfter) ? Number(retryAfter) : null;
      throw new RateLimitError(
        seconds ? `Aguarde ${seconds} segundos para tentar novamente.` : undefined,
      );
    }
    return { response, payload };
  }

  async start(input: ConsumerVerificationStartInput): Promise<ConsumerVerificationStartResult> {
    if (input.subject.kind !== 'phone') throw unavailable();
    const { response, payload } = await this.request('/v1/verify/verifications', {
      to: { phone_number: `+${input.subject.normalized}` },
      options: { code_length: 6, channels: ['sms'] },
    });
    const verification = payload as BirdVerification | null;
    if (!response.ok || verification?.status !== 'pending') throw unavailable();
    return {
      provider: this.name,
      expiresAt: parseExpiry(verification.expires_at),
    };
  }

  async verify(
    subject: ConsumerVerificationSubject,
    code: string,
  ): Promise<ConsumerVerificationResult> {
    if (subject.kind !== 'phone') throw unavailable();
    const { response, payload } = await this.request('/v1/verify/verifications/check', {
      to: { phone_number: `+${subject.normalized}` },
      code,
    });
    if (response.status === 404 || response.status === 422) {
      return { verified: false, terminal: true };
    }
    if (!response.ok) throw unavailable();

    const check = payload as BirdCheck | null;
    if (check?.success === true) return { verified: true, terminal: true };
    if (check?.success !== false) throw unavailable();
    const reason = typeof check.reason === 'string' ? check.reason : '';
    const attemptsRemaining =
      typeof check.attempts_remaining === 'number' ? check.attempts_remaining : null;
    const status =
      typeof check.verification?.status === 'string' ? check.verification.status : 'pending';
    return {
      verified: false,
      terminal:
        reason === 'expired' ||
        reason === 'attempts_exhausted' ||
        attemptsRemaining === 0 ||
        ['failed', 'expired', 'canceled', 'blocked'].includes(status),
    };
  }

  async resend(input: ConsumerVerificationStartInput): Promise<ConsumerVerificationStartResult> {
    return this.start(input);
  }
}

const providers = {
  bird: new BirdProvider(),
  resend: new ResendProvider(),
  development: new DevelopmentProvider(),
  disabled: new DisabledProvider(),
} as const;

export function getConsumerVerificationProvider(): ConsumerVerificationProvider {
  const selected = process.env.CONSUMER_VERIFICATION_PROVIDER?.trim().toLowerCase();
  if (selected === 'bird') return providers.bird;
  if (selected === 'resend') return providers.resend;
  if (selected === 'development') return providers.development;
  return providers.disabled;
}

export function getConsumerVerificationProviderByName(name: string) {
  const provider = getConsumerVerificationProvider();
  return provider.name === name ? provider : providers.disabled;
}

export function isConsumerVerificationReady() {
  return getConsumerVerificationProvider().isReady();
}

export function getConsumerVerificationMethod() {
  return getConsumerVerificationProvider().method;
}

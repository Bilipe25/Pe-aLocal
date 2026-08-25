import 'server-only';

import { randomUUID } from 'node:crypto';

import { BusinessRuleError, RateLimitError } from '@/server/errors';
import { isDeployedRuntime } from '@/server/runtime-environment';

const VERIFY_TIMEOUT_SECONDS = 5 * 60;
const BIRD_KEY_PATTERN = /^bk_([a-z]{2}[0-9]+)_[A-Za-z0-9]{20,}$/u;

export interface ConsumerVerificationStartResult {
  provider: 'bird' | 'development';
  expiresAt: Date;
}

export interface ConsumerVerificationResult {
  verified: boolean;
  terminal: boolean;
}

export interface ConsumerVerificationProvider {
  readonly name: 'bird' | 'development' | 'disabled';
  isReady(): boolean;
  start(phoneNormalized: string): Promise<ConsumerVerificationStartResult>;
  verify(phoneNormalized: string, code: string): Promise<ConsumerVerificationResult>;
  resend(phoneNormalized: string): Promise<ConsumerVerificationStartResult>;
}

function unavailable() {
  return new BusinessRuleError(
    'A confirmação por celular está temporariamente indisponível. Tente novamente mais tarde.',
  );
}

function localExpiry() {
  return new Date(Date.now() + VERIFY_TIMEOUT_SECONDS * 1_000);
}

class DisabledProvider implements ConsumerVerificationProvider {
  readonly name = 'disabled' as const;
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
  isReady() {
    return (
      !isDeployedRuntime() &&
      (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test')
    );
  }
  async start(): Promise<ConsumerVerificationStartResult> {
    if (!this.isReady()) throw unavailable();
    return { provider: this.name, expiresAt: localExpiry() };
  }
  async verify(_phoneNormalized: string, code: string): Promise<ConsumerVerificationResult> {
    if (!this.isReady()) throw unavailable();
    return { verified: code === '000000', terminal: false };
  }
  async resend(): Promise<ConsumerVerificationStartResult> {
    return this.start();
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
    : localExpiry();
}

class BirdProvider implements ConsumerVerificationProvider {
  readonly name = 'bird' as const;

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

  async start(phoneNormalized: string): Promise<ConsumerVerificationStartResult> {
    const { response, payload } = await this.request('/v1/verify/verifications', {
      to: { phone_number: `+${phoneNormalized}` },
      options: { code_length: 6, channels: ['sms'] },
    });
    const verification = payload as BirdVerification | null;
    if (!response.ok || verification?.status !== 'pending') throw unavailable();
    return {
      provider: this.name,
      expiresAt: parseExpiry(verification.expires_at),
    };
  }

  async verify(phoneNormalized: string, code: string): Promise<ConsumerVerificationResult> {
    const { response, payload } = await this.request('/v1/verify/verifications/check', {
      to: { phone_number: `+${phoneNormalized}` },
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

  async resend(phoneNormalized: string): Promise<ConsumerVerificationStartResult> {
    return this.start(phoneNormalized);
  }
}

const providers = {
  bird: new BirdProvider(),
  development: new DevelopmentProvider(),
  disabled: new DisabledProvider(),
} as const;

export function getConsumerVerificationProvider(): ConsumerVerificationProvider {
  const selected = process.env.CONSUMER_VERIFICATION_PROVIDER?.trim().toLowerCase();
  if (selected === 'bird') return providers.bird;
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

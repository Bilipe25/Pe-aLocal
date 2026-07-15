import { getCloudflareContext } from '@opennextjs/cloudflare';

export interface RateLimitInput {
  identifier: string;
  maxAttempts: number;
  windowInSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export interface RateLimiter {
  check(input: RateLimitInput): Promise<RateLimitResult>;
  reset(identifier: string): Promise<void>;
}

function selectBinding(env: CloudflareEnv, identifier: string): RateLimit {
  return identifier.startsWith('login:') || identifier.startsWith('password-recovery:')
    ? env.AUTH_RATE_LIMITER
    : env.ORDER_RATE_LIMITER;
}

class WorkersRateLimiter implements RateLimiter {
  async check(input: RateLimitInput): Promise<RateLimitResult> {
    try {
      const { env } = getCloudflareContext();
      const outcome = await selectBinding(env, input.identifier).limit({
        key: input.identifier,
      });
      return {
        allowed: outcome.success,
        remaining: outcome.success ? Math.max(0, input.maxAttempts - 1) : 0,
        resetAt: Date.now() + input.windowInSeconds * 1000,
      };
    } catch {
      // `next dev` e testes Node não possuem o binding. Supabase ainda aplica
      // seus limites; o limite distribuído é obrigatório no preview/deploy.
      return {
        allowed: true,
        remaining: input.maxAttempts,
        resetAt: Date.now() + input.windowInSeconds * 1000,
      };
    }
  }

  async reset(identifier: string): Promise<void> {
    void identifier;
    // O binding nativo usa janela fixa e não expõe operação de reset.
  }
}

export function getRateLimiter(): RateLimiter {
  return new WorkersRateLimiter();
}

export const RATE_LIMITS = {
  login: { maxAttempts: 5, windowInSeconds: 60 },
  createOrder: { maxAttempts: 10, windowInSeconds: 60 },
  publicOrderLookup: { maxAttempts: 30, windowInSeconds: 60 },
  reportPayment: { maxAttempts: 5, windowInSeconds: 60 },
  passwordRecovery: { maxAttempts: 5, windowInSeconds: 60 },
} as const;

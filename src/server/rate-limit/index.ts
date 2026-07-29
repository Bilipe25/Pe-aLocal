import { getCloudflareContext } from '@opennextjs/cloudflare';

export interface RateLimitInput {
  identifier: string;
  maxAttempts: number;
  windowInSeconds: number;
  strict?: boolean;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  unavailable?: boolean;
}

export interface RateLimiter {
  check(input: RateLimitInput): Promise<RateLimitResult>;
  reset(identifier: string): Promise<void>;
}

function selectBinding(env: CloudflareEnv, identifier: string): RateLimit {
  if (identifier.startsWith('report-payment:')) return env.PAYMENT_REPORT_RATE_LIMITER;
  if (
    identifier.startsWith('checkout-quote:') ||
    identifier.startsWith('checkout-event:') ||
    identifier.startsWith('recommendation:') ||
    identifier.startsWith('recognition-store:')
  ) {
    return env.CHECKOUT_QUOTE_RATE_LIMITER;
  }
  if (identifier.startsWith('order-ip:') || identifier.startsWith('recognition-ip:')) {
    return env.ORDER_IP_RATE_LIMITER;
  }
  return identifier.startsWith('login:') ||
    identifier.startsWith('password-recovery:') ||
    identifier.startsWith('recognition-phone:')
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
        allowed: !input.strict,
        remaining: input.maxAttempts,
        resetAt: Date.now() + input.windowInSeconds * 1000,
        unavailable: input.strict,
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
  createOrderByIp: { maxAttempts: 30, windowInSeconds: 60 },
  checkoutQuote: { maxAttempts: 60, windowInSeconds: 60 },
  storefrontRecommendations: { maxAttempts: 60, windowInSeconds: 60 },
  customerRecognitionByStore: { maxAttempts: 60, windowInSeconds: 60 },
  customerRecognitionByIp: { maxAttempts: 30, windowInSeconds: 60 },
  customerRecognitionByPhone: { maxAttempts: 5, windowInSeconds: 60 },
  customerRecognitionByDevice: { maxAttempts: 20, windowInSeconds: 300 },
  publicOrderLookup: { maxAttempts: 30, windowInSeconds: 60 },
  reportPayment: { maxAttempts: 5, windowInSeconds: 60 },
  passwordRecovery: { maxAttempts: 5, windowInSeconds: 60 },
} as const;

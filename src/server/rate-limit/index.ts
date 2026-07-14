// =============================================================================
// Rate Limiting — PedidoLocal
// =============================================================================
// Interface para rate limiting + implementação in-memory para desenvolvimento.
// Em produção (serverless), substituir por Upstash Redis.
// =============================================================================

export interface RateLimitInput {
  /** Identificador único (ex: IP, e-mail, telefone) */
  identifier: string;
  /** Número máximo de requisições permitidas na janela */
  maxAttempts: number;
  /** Duração da janela em segundos */
  windowInSeconds: number;
}

export interface RateLimitResult {
  /** Se a requisição é permitida */
  allowed: boolean;
  /** Tentativas restantes na janela */
  remaining: number;
  /** Timestamp (ms) de quando a janela reseta */
  resetAt: number;
}

export interface RateLimiter {
  check(input: RateLimitInput): Promise<RateLimitResult>;
  /** Reseta o contador para um identificador (ex: após login bem-sucedido) */
  reset(identifier: string): Promise<void>;
}

// =============================================================================
// Implementação In-Memory (apenas desenvolvimento)
// =============================================================================
// ⚠️ NÃO usar em produção serverless — cada instância tem memória isolada.
// Em produção, substituir por UpstashRateLimiter (futuramente).
// =============================================================================

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

class InMemoryRateLimiter implements RateLimiter {
  private store = new Map<string, RateLimitEntry>();

  async check(input: RateLimitInput): Promise<RateLimitResult> {
    const now = Date.now();
    const key = input.identifier;
    const entry = this.store.get(key);

    // Janela expirada ou primeira requisição
    if (!entry || now >= entry.resetAt) {
      const resetAt = now + input.windowInSeconds * 1000;
      this.store.set(key, { count: 1, resetAt });
      return {
        allowed: true,
        remaining: input.maxAttempts - 1,
        resetAt,
      };
    }

    // Dentro da janela
    entry.count += 1;

    if (entry.count > input.maxAttempts) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: entry.resetAt,
      };
    }

    return {
      allowed: true,
      remaining: input.maxAttempts - entry.count,
      resetAt: entry.resetAt,
    };
  }

  async reset(identifier: string): Promise<void> {
    this.store.delete(identifier);
  }
}

// =============================================================================
// Singleton
// =============================================================================

let _rateLimiter: RateLimiter | undefined;

/**
 * Retorna a instância do rate limiter.
 * No MVP, usa implementação in-memory.
 * Futuramente: trocar por Upstash Redis.
 */
export function getRateLimiter(): RateLimiter {
  if (!_rateLimiter) {
    _rateLimiter = new InMemoryRateLimiter();
  }
  return _rateLimiter;
}

// =============================================================================
// Presets de rate limit
// =============================================================================

export const RATE_LIMITS = {
  /** Login: 5 tentativas por 15 minutos */
  login: { maxAttempts: 5, windowInSeconds: 15 * 60 },
  /** Criação de pedido: 10 por minuto */
  createOrder: { maxAttempts: 10, windowInSeconds: 60 },
  /** Consulta pública de pedido: 30 por minuto */
  publicOrderLookup: { maxAttempts: 30, windowInSeconds: 60 },
  /** Reportar pagamento: 5 por 5 minutos */
  reportPayment: { maxAttempts: 5, windowInSeconds: 5 * 60 },
  /** Recuperação de senha: 3 por 15 minutos */
  passwordRecovery: { maxAttempts: 3, windowInSeconds: 15 * 60 },
} as const;

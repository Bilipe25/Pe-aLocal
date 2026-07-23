// =============================================================================
// Erros de Domínio — PedidoLocal
// =============================================================================
// Erros estruturados para uso em services, actions e route handlers.
// Nunca retorne exceções brutas ao cliente — use estes erros tipados.
// =============================================================================

/**
 * Erro base de domínio. Todos os erros específicos estendem esta classe.
 */
export abstract class DomainError extends Error {
  abstract readonly statusCode: number;
  abstract readonly code: string;
  readonly details: Record<string, unknown>[];

  constructor(message: string, details: Record<string, unknown>[] = []) {
    super(message);
    this.name = this.constructor.name;
    this.details = details;
  }

  /**
   * Converte para formato seguro de resposta HTTP.
   * Nunca inclui stack trace, SQL ou dados internos.
   */
  toJSON() {
    return {
      statusCode: this.statusCode,
      code: this.code,
      message: this.message,
      details: this.details,
    };
  }
}

/**
 * 400 — Dados de entrada inválidos.
 */
export class ValidationError extends DomainError {
  readonly statusCode = 400;
  readonly code = 'VALIDATION_ERROR';

  constructor(message = 'Os dados enviados são inválidos.', details: Record<string, unknown>[] = []) {
    super(message, details);
  }
}

/**
 * 401 — Usuário não autenticado.
 */
export class AuthenticationError extends DomainError {
  readonly statusCode = 401;
  readonly code = 'AUTHENTICATION_ERROR';

  constructor(message = 'Autenticação necessária.') {
    super(message);
  }
}

/**
 * 403 — Usuário sem permissão.
 */
export class AuthorizationError extends DomainError {
  readonly statusCode = 403;
  readonly code = 'AUTHORIZATION_ERROR';

  constructor(message = 'Você não tem permissão para realizar esta ação.') {
    super(message);
  }
}

/**
 * 403 — Acesso a tenant não autorizado.
 */
export class TenantAccessError extends DomainError {
  readonly statusCode = 403;
  readonly code = 'TENANT_ACCESS_ERROR';

  constructor(message = 'Acesso não autorizado a este estabelecimento.') {
    super(message);
  }
}

/**
 * 404 — Recurso não encontrado.
 */
export class NotFoundError extends DomainError {
  readonly statusCode = 404;
  readonly code = 'NOT_FOUND';

  constructor(resource = 'Recurso', identifier?: string) {
    const msg = identifier
      ? `${resource} "${identifier}" não encontrado.`
      : `${resource} não encontrado.`;
    super(msg);
  }
}

/**
 * 409 — Conflito (ex.: slug duplicado, pedido já existe).
 */
export class ConflictError extends DomainError {
  readonly statusCode = 409;
  readonly code = 'CONFLICT';

  constructor(message = 'Este recurso já existe.') {
    super(message);
  }
}

/**
 * 409 — Conflito de concorrência otimista.
 * Ocorre quando dois usuários editam o mesmo recurso simultaneamente.
 * O cliente deve recarregar o recurso e re-aplicar as alterações.
 */
export class ConcurrencyError extends DomainError {
  readonly statusCode = 409;
  readonly code = 'CONCURRENCY_CONFLICT';

  constructor(resource = 'Recurso') {
    super(
      `${resource} foi alterado por outro usuário. Recarregue a página e tente novamente.`,
    );
  }
}

/**
 * 422 — Regra de negócio violada (ex.: loja fechada, pedido mínimo).
 */
export class BusinessRuleError extends DomainError {
  readonly statusCode = 422;
  readonly code = 'BUSINESS_RULE_ERROR';

  constructor(message: string, details: Record<string, unknown>[] = []) {
    super(message, details);
  }
}

export class OrderPaymentConsistencyError extends DomainError {
  readonly statusCode = 422;
  readonly code = 'ORDER_PAYMENT_INCONSISTENT';

  constructor() {
    super('Os dados de pagamento deste pedido estão inconsistentes. A operação foi bloqueada.');
  }
}

export class OrderUndoNotAllowedError extends DomainError {
  readonly statusCode = 422;
  readonly code = 'ORDER_UNDO_NOT_ALLOWED';

  constructor() {
    super('Esta alteração não pode mais ser desfeita. Atualize a central e revise o pedido.');
  }
}

/**
 * 429 — Muitas requisições.
 */
export class RateLimitError extends DomainError {
  readonly statusCode = 429;
  readonly code = 'RATE_LIMIT_EXCEEDED';

  constructor(message = 'Muitas tentativas. Aguarde antes de tentar novamente.') {
    super(message);
  }
}

// =============================================================================
// Helper para converter DomainError em Response
// =============================================================================

/**
 * Converte um erro de domínio em NextResponse JSON.
 * Para uso em Route Handlers.
 */
export function errorToResponse(error: unknown): Response {
  if (error instanceof DomainError) {
    return Response.json(error.toJSON(), { status: error.statusCode });
  }

  // Erro inesperado — log interno, resposta genérica
  console.error('[UNEXPECTED_ERROR]', error);

  return Response.json(
    {
      statusCode: 500,
      code: 'INTERNAL_ERROR',
      message: 'Ocorreu um erro interno. Tente novamente mais tarde.',
      details: [],
    },
    { status: 500 },
  );
}

/**
 * Resultado tipado para Server Actions.
 * Evita lançar exceções — retorna resultado explícito.
 */
export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string; details?: Record<string, unknown>[] } };

/**
 * Cria um resultado de sucesso para Server Action.
 */
export function actionSuccess<T = void>(data?: T): ActionResult<T> {
  return { success: true, data: data as T };
}

/**
 * Cria um resultado de erro para Server Action.
 */
export function actionError(error: unknown): ActionResult<never> {
  if (error instanceof DomainError) {
    return {
      success: false,
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
      },
    };
  }

  console.error('[ACTION_ERROR]', error);

  return {
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Ocorreu um erro interno. Tente novamente mais tarde.',
    },
  };
}

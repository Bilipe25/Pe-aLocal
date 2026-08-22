import { describe, expect, it, vi } from 'vitest';
import {
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  TenantAccessError,
  NotFoundError,
  ConflictError,
  BusinessRuleError,
  RateLimitError,
  actionSuccess,
  actionError,
  errorToResponse,
} from '@/server/errors';

describe('Domain Errors', () => {
  it('ValidationError deve ter statusCode 400', () => {
    const err = new ValidationError();
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('VALIDATION_ERROR');
  });

  it('AuthenticationError deve ter statusCode 401', () => {
    const err = new AuthenticationError();
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('AUTHENTICATION_ERROR');
  });

  it('AuthorizationError deve ter statusCode 403', () => {
    const err = new AuthorizationError();
    expect(err.statusCode).toBe(403);
  });

  it('TenantAccessError deve ter statusCode 403', () => {
    const err = new TenantAccessError();
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe('TENANT_ACCESS_ERROR');
  });

  it('NotFoundError deve ter statusCode 404', () => {
    const err = new NotFoundError('Produto', '123');
    expect(err.statusCode).toBe(404);
    expect(err.message).toContain('Produto');
    expect(err.message).toContain('123');
  });

  it('ConflictError deve ter statusCode 409', () => {
    const err = new ConflictError();
    expect(err.statusCode).toBe(409);
  });

  it('BusinessRuleError deve ter statusCode 422', () => {
    const err = new BusinessRuleError('Loja fechada');
    expect(err.statusCode).toBe(422);
    expect(err.message).toBe('Loja fechada');
  });

  it('RateLimitError deve ter statusCode 429', () => {
    const err = new RateLimitError();
    expect(err.statusCode).toBe(429);
  });

  it('toJSON deve retornar formato seguro sem stack trace', () => {
    const err = new ValidationError('Erro teste', [{ field: 'email' }]);
    const json = err.toJSON();
    expect(json).toEqual({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'Erro teste',
      details: [{ field: 'email' }],
    });
    expect(json).not.toHaveProperty('stack');
  });
});

describe('Action Results', () => {
  it('actionSuccess deve retornar resultado de sucesso', () => {
    const result = actionSuccess({ id: '123' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ id: '123' });
    }
  });

  it('actionError com DomainError deve retornar erro tipado', () => {
    const result = actionError(new ValidationError('Campo inválido'));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('VALIDATION_ERROR');
      expect(result.error.message).toBe('Campo inválido');
    }
  });

  it('actionError com erro genérico deve retornar INTERNAL_ERROR', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const unsafeError = Object.assign(new Error('token=segredo telefone=85999999999'), {
        customerPhone: '85999999999',
      });
      const result = actionError(unsafeError);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INTERNAL_ERROR');
      }
      expect(consoleError).toHaveBeenCalledWith('[ACTION_ERROR]', { kind: 'error' });
      expect(consoleError.mock.calls[0]).not.toContain(unsafeError);
      expect(JSON.stringify(consoleError.mock.calls)).not.toContain('segredo');
      expect(JSON.stringify(consoleError.mock.calls)).not.toContain('85999999999');
    } finally {
      consoleError.mockRestore();
    }
  });

  it('errorToResponse classifica por allowlist sem registrar mensagem, stack ou PII', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const unsafeError = new TypeError('SQL com email cliente@exemplo.test');
      const response = errorToResponse(unsafeError);

      expect(response.status).toBe(500);
      expect(await response.json()).toMatchObject({ code: 'INTERNAL_ERROR' });
      expect(consoleError).toHaveBeenCalledWith('[UNEXPECTED_ERROR]', { kind: 'type_error' });
      expect(consoleError.mock.calls[0]).not.toContain(unsafeError);
      expect(JSON.stringify(consoleError.mock.calls)).not.toContain('cliente@exemplo.test');
    } finally {
      consoleError.mockRestore();
    }
  });

  it('registra somente o código allowlisted de um erro conhecido do Prisma', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const databaseError = Object.assign(new Error('constraint com telefone=85999999999'), {
        name: 'PrismaClientKnownRequestError',
        code: 'P2003',
        meta: { database_error: 'telefone=85999999999' },
      });

      const result = actionError(databaseError);

      expect(result.success).toBe(false);
      expect(consoleError).toHaveBeenCalledWith('[ACTION_ERROR]', {
        kind: 'database_known_error',
        databaseCode: 'P2003',
      });
      expect(JSON.stringify(consoleError.mock.calls)).not.toContain('85999999999');
      expect(JSON.stringify(consoleError.mock.calls)).not.toContain('database_error');
    } finally {
      consoleError.mockRestore();
    }
  });
});

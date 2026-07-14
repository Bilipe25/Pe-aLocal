import { describe, it, expect } from 'vitest';
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
    const result = actionError(new Error('Unexpected'));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('INTERNAL_ERROR');
    }
  });
});

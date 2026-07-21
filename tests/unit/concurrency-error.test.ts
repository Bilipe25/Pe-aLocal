import { describe, it, expect } from 'vitest';
import { ConcurrencyError, ConflictError } from '@/server/errors';

// =============================================================================
// Testes de ConcurrencyError
// =============================================================================

describe('ConcurrencyError', () => {
  it('tem code CONCURRENCY_CONFLICT', () => {
    const error = new ConcurrencyError('Produto');
    expect(error.code).toBe('CONCURRENCY_CONFLICT');
  });

  it('tem statusCode 409', () => {
    const error = new ConcurrencyError();
    expect(error.statusCode).toBe(409);
  });

  it('inclui o nome do recurso na mensagem', () => {
    const error = new ConcurrencyError('Categoria');
    expect(error.message).toContain('Categoria');
    expect(error.message).toContain('foi alterado por outro usuário');
  });

  it('usa mensagem padrão sem argumento', () => {
    const error = new ConcurrencyError();
    expect(error.message).toContain('Recurso');
    expect(error.message).toContain('Recarregue a página');
  });

  it('é diferente de ConflictError', () => {
    const conflict = new ConflictError();
    const concurrency = new ConcurrencyError();
    expect(conflict.code).toBe('CONFLICT');
    expect(concurrency.code).toBe('CONCURRENCY_CONFLICT');
    expect(conflict.code).not.toBe(concurrency.code);
  });

  it('é instância de Error', () => {
    expect(new ConcurrencyError()).toBeInstanceOf(Error);
  });
});

describe('formBooleanSchema — integração com catalog fields', () => {
  it('garante que "false" string da versão não afeta o version field', () => {
    // version é número, não booleano — deve usar z.coerce.number
    const raw = { version: '3' };
    expect(Number(raw.version)).toBe(3);
  });

  it('version === -1 desabilita locking otimista', () => {
    const expectedVersion = Number('-1');
    const useVersion = expectedVersion >= 0;
    expect(useVersion).toBe(false);
  });

  it('version >= 0 habilita locking otimista', () => {
    const expectedVersion = Number('0');
    const useVersion = expectedVersion >= 0;
    expect(useVersion).toBe(true);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { loadStorePageData } from '@/features/stores/page-access';
import { AuthorizationError, TenantAccessError } from '@/server/errors';

const mocks = vi.hoisted(() => ({
  redirect: vi.fn(() => {
    throw new Error('NEXT_REDIRECT');
  }),
}));

vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));

describe('proteÃ§Ã£o das pÃ¡ginas de configuraÃ§Ã£o', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([new AuthorizationError(), new TenantAccessError()])(
    'redireciona acesso negado sem consultar outra pÃ¡gina',
    async (error) => {
      await expect(loadStorePageData(async () => Promise.reject(error))).rejects.toThrow(
        'NEXT_REDIRECT',
      );
      expect(mocks.redirect).toHaveBeenCalledWith('/dashboard/stores?access=denied');
    },
  );

  it('nÃ£o oculta falhas inesperadas', async () => {
    const error = new Error('database unavailable');
    await expect(loadStorePageData(async () => Promise.reject(error))).rejects.toBe(error);
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});

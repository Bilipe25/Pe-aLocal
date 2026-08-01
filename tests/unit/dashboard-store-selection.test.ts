import { beforeEach, describe, expect, it, vi } from 'vitest';

import { selectStoreAction } from '@/features/stores/actions';

const mocks = vi.hoisted(() => ({
  redirect: vi.fn(),
  rememberActiveStore: vi.fn(),
}));

vi.mock('next/cache', () => ({ updateTag: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('@/server/services/store-context.service', () => ({
  rememberActiveStore: mocks.rememberActiveStore,
}));
vi.mock('@/server/services/store-settings.service', () => ({}));

const activeStoreId = '00000000-0000-0000-0000-000000000002';

function selectionForm(returnTo?: string) {
  const formData = new FormData();
  formData.set('storeId', activeStoreId);
  if (returnTo !== undefined) formData.set('returnTo', returnTo);
  return formData;
}

describe('troca segura da unidade ativa', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rememberActiveStore.mockResolvedValue({ store: { id: activeStoreId } });
    mocks.redirect.mockImplementation(() => {
      throw new Error('NEXT_REDIRECT');
    });
  });

  it('preserva uma rota interna do painel', async () => {
    await expect(selectStoreAction(selectionForm('/dashboard/orders'))).rejects.toThrow(
      'NEXT_REDIRECT',
    );
    expect(mocks.redirect).toHaveBeenCalledWith('/dashboard/orders');
  });

  it('reescreve rotas de configuração para a unidade selecionada', async () => {
    await expect(
      selectStoreAction(
        selectionForm(
          '/dashboard/stores/00000000-0000-0000-0000-000000000001/hours?section=schedule',
        ),
      ),
    ).rejects.toThrow('NEXT_REDIRECT');
    expect(mocks.redirect).toHaveBeenCalledWith(
      `/dashboard/stores/${activeStoreId}/hours?section=schedule`,
    );
  });

  it('remove referências de entidades pertencentes à unidade anterior', async () => {
    await expect(
      selectStoreAction(
        selectionForm('/dashboard/catalog/products/00000000-0000-0000-0000-000000000001/edit'),
      ),
    ).rejects.toThrow('NEXT_REDIRECT');
    expect(mocks.redirect).toHaveBeenCalledWith('/dashboard/catalog');

    mocks.redirect.mockClear();
    await expect(
      selectStoreAction(
        selectionForm(
          '/dashboard/orders?order=00000000-0000-0000-0000-000000000001&statuses=PENDING',
        ),
      ),
    ).rejects.toThrow('NEXT_REDIRECT');
    expect(mocks.redirect).toHaveBeenCalledWith('/dashboard/orders?statuses=PENDING');
  });

  it.each([
    ['URL externa', 'https://evil.example/dashboard'],
    ['URL protocol-relative', '//evil.example/dashboard'],
    ['prefixo parecido', '/dashboard-externo'],
    ['barra invertida', '/dashboard\\@evil.example'],
  ])('rejeita %s em returnTo', async (_label, returnTo) => {
    await expect(selectStoreAction(selectionForm(returnTo))).rejects.toThrow('NEXT_REDIRECT');
    expect(mocks.redirect).toHaveBeenCalledWith(`/dashboard/stores/${activeStoreId}`);
  });
});

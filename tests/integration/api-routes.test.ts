import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { AuthenticationError, AuthorizationError } from '@/server/errors';
import { GET as getHealth } from '@/app/api/health/route';
import { POST as postLogin } from '@/app/api/auth/login/route';
import { POST as postLogout } from '@/app/api/auth/logout/route';
import { GET as getCurrentUser } from '@/app/api/auth/me/route';
import { POST as postStoreAsset } from '@/app/api/admin/tenants/[tenantId]/stores/[storeId]/assets/route';

const mocks = vi.hoisted(() => ({
  login: vi.fn(),
  logout: vi.fn(),
  requireAuthenticatedUser: vi.fn(),
  requireSuperAdminStoreAccess: vi.fn(),
  uploadStoreAsset: vi.fn(),
}));

vi.mock('@/server/services/auth.service', () => ({
  login: mocks.login,
  logout: mocks.logout,
}));

vi.mock('@/server/auth', () => ({
  requireAuthenticatedUser: mocks.requireAuthenticatedUser,
  requireSuperAdminStoreAccess: mocks.requireSuperAdminStoreAccess,
}));

vi.mock('@/server/services/store-asset.service', () => ({
  uploadStoreAsset: mocks.uploadStoreAsset,
}));

describe('API routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('expõe um health check sem cache', async () => {
    const response = await getHealth();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(body).toMatchObject({ status: 'ok', version: '0.1.0' });
    if (
      typeof body !== 'object' ||
      body === null ||
      !('timestamp' in body) ||
      typeof body.timestamp !== 'string'
    ) {
      throw new Error('Health check sem timestamp válido');
    }
    expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
  });

  describe('POST /api/auth/login', () => {
    it('retorna 400 para JSON inválido', async () => {
      const request = new NextRequest('http://localhost/api/auth/login', {
        method: 'POST',
        body: '{json inválido',
        headers: { 'content-type': 'application/json' },
      });

      const response = await postLogin(request);

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        code: 'VALIDATION_ERROR',
        message: 'Corpo da requisição inválido.',
      });
      expect(mocks.login).not.toHaveBeenCalled();
    });

    it('retorna detalhes seguros para dados inválidos', async () => {
      const request = new NextRequest('http://localhost/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: 'invalido', password: 'curta' }),
        headers: { 'content-type': 'application/json' },
      });

      const response = await postLogin(request);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body).toMatchObject({
        code: 'VALIDATION_ERROR',
        details: expect.arrayContaining([
          expect.objectContaining({ field: 'email' }),
          expect.objectContaining({ field: 'password' }),
        ]),
      });
    });

    it('encaminha IP e user-agent e retorna o contexto autenticado', async () => {
      mocks.login.mockResolvedValue({
        user: { id: 'user-1', email: 'dono@demo.com', name: 'Dono Demo' },
        platformRole: 'USER',
        tenantRole: 'OWNER',
        tenantId: 'tenant-1',
        storeId: 'store-1',
        destination: '/dashboard',
      });
      const request = new NextRequest('http://localhost/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: 'dono@demo.com',
          password: 'SenhaDemo123!',
        }),
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': '203.0.113.10, 10.0.0.1',
          'user-agent': 'Vitest',
        },
      });

      const response = await postLogin(request);

      expect(mocks.login).toHaveBeenCalledWith(
        { email: 'dono@demo.com', password: 'SenhaDemo123!' },
        { ipAddress: '203.0.113.10', userAgent: 'Vitest', redirectTo: null },
      );
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        user: { id: 'user-1' },
        destination: '/dashboard',
      });
    });

    it('converte erros de autenticação em resposta 401', async () => {
      mocks.login.mockRejectedValue(new AuthenticationError('E-mail ou senha incorretos.'));
      const request = new NextRequest('http://localhost/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: 'dono@demo.com',
          password: 'SenhaDemo123!',
        }),
        headers: { 'content-type': 'application/json' },
      });

      const response = await postLogin(request);

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toMatchObject({
        code: 'AUTHENTICATION_ERROR',
      });
    });
  });

  it('POST /api/auth/logout confirma a revogação da sessão', async () => {
    mocks.logout.mockResolvedValue(undefined);

    const response = await postLogout();

    expect(mocks.logout).toHaveBeenCalledOnce();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      message: 'Logout realizado com sucesso.',
    });
  });

  it('GET /api/auth/me protege e serializa o contexto atual', async () => {
    mocks.requireAuthenticatedUser.mockResolvedValue({
      userId: 'user-1',
      email: 'dono@demo.com',
      name: 'Dono Demo',
      platformRole: 'USER',
      tenantRole: 'OWNER',
      tenantId: 'tenant-1',
      storeId: 'store-1',
    });

    const response = await getCurrentUser();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      user: { id: 'user-1', email: 'dono@demo.com', name: 'Dono Demo' },
      platformRole: 'USER',
      tenantRole: 'OWNER',
      tenantId: 'tenant-1',
      storeId: 'store-1',
    });
  });

  it('GET /api/auth/me retorna 401 sem sessão', async () => {
    mocks.requireAuthenticatedUser.mockRejectedValue(new AuthenticationError());

    const response = await getCurrentUser();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      code: 'AUTHENTICATION_ERROR',
    });
  });

  it('autoriza upload administrativo antes de materializar o multipart', async () => {
    mocks.requireSuperAdminStoreAccess.mockRejectedValue(new AuthorizationError());
    const request = new Request('http://localhost/api/admin/assets', {
      method: 'POST',
      body: 'conteúdo que não deve ser lido',
    });
    const formDataSpy = vi.spyOn(request, 'formData');

    const response = await postStoreAsset(request, {
      params: Promise.resolve({ tenantId: 'tenant-1', storeId: 'store-1' }),
    });

    expect(response.status).toBe(403);
    expect(formDataSpy).not.toHaveBeenCalled();
    expect(mocks.uploadStoreAsset).not.toHaveBeenCalled();
  });

  it('aceita upload CATEGORY_IMAGE somente após autorização administrativa', async () => {
    const asset = {
      id: 'asset-category',
      assetType: 'CATEGORY_IMAGE',
      altText: 'Hambúrguer artesanal',
    };
    mocks.requireSuperAdminStoreAccess.mockResolvedValue({ session: { userId: 'admin-1' } });
    mocks.uploadStoreAsset.mockResolvedValue(asset);
    const file = new File(['png'], 'categoria.png', { type: 'image/png' });
    const request = new Request('http://localhost/api/admin/assets', { method: 'POST' });
    vi.spyOn(request, 'formData').mockResolvedValue({
      get: (key: string) =>
        ({
          file,
          assetType: 'CATEGORY_IMAGE',
          altText: 'Hambúrguer artesanal',
        })[key] ?? null,
    } as FormData);

    const response = await postStoreAsset(request, {
      params: Promise.resolve({ tenantId: 'tenant-1', storeId: 'store-1' }),
    });

    expect(response.status).toBe(201);
    expect(mocks.uploadStoreAsset).toHaveBeenCalledWith('tenant-1', 'store-1', file, {
      assetType: 'CATEGORY_IMAGE',
      altText: 'Hambúrguer artesanal',
    });
    await expect(response.json()).resolves.toEqual({ asset });
  });
});

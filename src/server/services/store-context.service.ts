import 'server-only';

import { cookies } from 'next/headers';
import { z } from 'zod';

import { requirePermission, requireTenantStoreAccess } from '@/server/auth';
import { TenantAccessError } from '@/server/errors';
import { Permission, type Permission as PermissionType } from '@/server/permissions';
import * as storeRepo from '@/server/repositories/store.repository';

export const ACTIVE_STORE_COOKIE = 'pedidolocal-active-store';

const storeIdSchema = z.string().uuid();

export interface AccessibleStoresPage {
  items: Awaited<ReturnType<typeof storeRepo.listStoreSummariesByTenantId>>;
  total: number;
  page: number;
  pageSize: number;
}

export async function listAccessibleStores(
  options: { page?: number; pageSize?: number } = {},
): Promise<AccessibleStoresPage> {
  const session = await requirePermission(Permission.VIEW_STORE_OVERVIEW);
  const page = Math.max(1, Math.trunc(options.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Math.trunc(options.pageSize ?? 20)));
  const [items, total] = await Promise.all([
    storeRepo.listStoreSummariesByTenantId(session.tenantId, {
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    storeRepo.countStoresByTenantId(session.tenantId),
  ]);

  return { items, total, page, pageSize };
}

export async function getActiveStoreContext(permission?: PermissionType) {
  const session = await requirePermission(permission ?? Permission.VIEW_STORE_OVERVIEW);
  const cookieStoreId = (await cookies()).get(ACTIVE_STORE_COOKIE)?.value;
  const parsedCookie = storeIdSchema.safeParse(cookieStoreId);

  if (parsedCookie.success) {
    const store = await storeRepo.findStoreScopeById(parsedCookie.data, session.tenantId);
    if (store) return { session, store };
  }

  const stores = await storeRepo.listStoreSummariesByTenantId(session.tenantId, { take: 2 });
  if (stores.length === 1) {
    const store = await storeRepo.findStoreScopeById(stores[0].id, session.tenantId);
    if (store) return { session, store };
  }

  return null;
}

export async function requireActiveStoreContext(permission?: PermissionType) {
  const context = await getActiveStoreContext(permission);
  if (!context) {
    throw new TenantAccessError('Selecione uma loja para continuar.');
  }
  return context;
}

export async function rememberActiveStore(storeId: string) {
  const parsed = storeIdSchema.safeParse(storeId);
  if (!parsed.success) {
    throw new TenantAccessError('A loja selecionada é inválida.');
  }

  const context = await requireTenantStoreAccess(parsed.data);
  (await cookies()).set(ACTIVE_STORE_COOKIE, context.store.id, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/dashboard',
    maxAge: 60 * 60 * 24 * 90,
  });

  return context;
}

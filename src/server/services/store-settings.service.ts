import 'server-only';

import { requireTenantStoreAccess } from '@/server/auth';
import { TenantAccessError } from '@/server/errors';
import { hasTenantPermission, Permission, type TenantRole } from '@/server/permissions';
import * as storeRepo from '@/server/repositories/store.repository';

export interface StorePageCapabilities {
  viewGeneral: boolean;
  editGeneral: boolean;
  viewAddress: boolean;
  editAddress: boolean;
  viewHours: boolean;
  editHours: boolean;
  viewOperations: boolean;
  editOperations: boolean;
  viewPayments: boolean;
  editPayments: boolean;
  changeStatus: boolean;
}

export function getStorePageCapabilities(role: TenantRole): StorePageCapabilities {
  return {
    viewGeneral: hasTenantPermission(role, Permission.VIEW_STORE_GENERAL),
    editGeneral: hasTenantPermission(role, Permission.EDIT_STORE_GENERAL),
    viewAddress: hasTenantPermission(role, Permission.VIEW_STORE_ADDRESS),
    editAddress: hasTenantPermission(role, Permission.EDIT_STORE_ADDRESS),
    viewHours: hasTenantPermission(role, Permission.VIEW_STORE_HOURS),
    editHours: hasTenantPermission(role, Permission.EDIT_STORE_HOURS),
    viewOperations: hasTenantPermission(role, Permission.VIEW_STORE_OPERATIONS),
    editOperations: hasTenantPermission(role, Permission.EDIT_STORE_OPERATIONS),
    viewPayments: hasTenantPermission(role, Permission.VIEW_PAYMENT_SETTINGS),
    editPayments: hasTenantPermission(role, Permission.EDIT_PAYMENT_SETTINGS),
    changeStatus: hasTenantPermission(role, Permission.CHANGE_STORE_STATUS),
  };
}

function missingStore(): never {
  throw new TenantAccessError('A loja não pertence ao estabelecimento autenticado.');
}

export async function getStoreOverview(storeId: string) {
  const { session } = await requireTenantStoreAccess(storeId, Permission.VIEW_STORE_OVERVIEW);
  const store = await storeRepo.findStoreOverviewById(storeId, session.tenantId);
  if (!store) missingStore();

  return { store, capabilities: getStorePageCapabilities(session.tenantRole) };
}

export async function getStoreGeneralSettings(storeId: string) {
  const { session } = await requireTenantStoreAccess(storeId, Permission.VIEW_STORE_GENERAL);
  const store = await storeRepo.findStoreGeneralSettingsById(storeId, session.tenantId);
  if (!store) missingStore();

  return {
    store,
    canEdit: hasTenantPermission(session.tenantRole, Permission.EDIT_STORE_GENERAL),
  };
}

export async function getStoreAddressSettings(storeId: string) {
  const { session } = await requireTenantStoreAccess(storeId, Permission.VIEW_STORE_ADDRESS);
  const store = await storeRepo.findStoreAddressSettingsById(storeId, session.tenantId);
  if (!store) missingStore();

  return {
    store,
    canEdit: hasTenantPermission(session.tenantRole, Permission.EDIT_STORE_ADDRESS),
  };
}

export async function getStoreHoursSettings(storeId: string) {
  const { session } = await requireTenantStoreAccess(storeId, Permission.VIEW_STORE_HOURS);
  const store = await storeRepo.findStoreHoursSettingsById(storeId, session.tenantId);
  if (!store) missingStore();

  return {
    store,
    canEdit: hasTenantPermission(session.tenantRole, Permission.EDIT_STORE_HOURS),
  };
}

export async function getStoreOperationalSettings(storeId: string) {
  const { session } = await requireTenantStoreAccess(storeId, Permission.VIEW_STORE_OPERATIONS);
  const store = await storeRepo.findStoreOperationalSettingsById(storeId, session.tenantId);
  if (!store) missingStore();

  return {
    store,
    canEdit: hasTenantPermission(session.tenantRole, Permission.EDIT_STORE_OPERATIONS),
  };
}

export async function getStorePaymentSettings(storeId: string) {
  const { session } = await requireTenantStoreAccess(storeId, Permission.VIEW_PAYMENT_SETTINGS);
  const store = await storeRepo.findStorePaymentSettingsById(storeId, session.tenantId);
  if (!store) missingStore();

  return {
    store,
    canEdit: hasTenantPermission(session.tenantRole, Permission.EDIT_PAYMENT_SETTINGS),
  };
}

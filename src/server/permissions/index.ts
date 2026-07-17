// =============================================================================
// Permissões e papéis — PedidoLocal
// =============================================================================
// Papéis de plataforma e de tenant são domínios de autorização independentes.
// =============================================================================

export const PlatformRole = {
  USER: 'USER',
  SUPER_ADMIN: 'SUPER_ADMIN',
} as const;

export type PlatformRole = (typeof PlatformRole)[keyof typeof PlatformRole];

export const TenantRole = {
  OWNER: 'OWNER',
  MANAGER: 'MANAGER',
  ATTENDANT: 'ATTENDANT',
} as const;

export type TenantRole = (typeof TenantRole)[keyof typeof TenantRole];

export const Permission = {
  VIEW_TENANTS: 'VIEW_TENANTS',
  ACTIVATE_TENANT: 'ACTIVATE_TENANT',
  SUSPEND_TENANT: 'SUSPEND_TENANT',
  VIEW_GLOBAL_METRICS: 'VIEW_GLOBAL_METRICS',
  ACCESS_SUPPORT_TOOLS: 'ACCESS_SUPPORT_TOOLS',
  VIEW_ADMIN_LOGS: 'VIEW_ADMIN_LOGS',
  CONFIGURE_STORE: 'CONFIGURE_STORE',
  EDIT_TENANT_INFO: 'EDIT_TENANT_INFO',
  MANAGE_TEAM: 'MANAGE_TEAM',
  MANAGE_CATALOG: 'MANAGE_CATALOG',
  VIEW_ORDERS: 'VIEW_ORDERS',
  MANAGE_ORDERS: 'MANAGE_ORDERS',
  ACCEPT_ORDERS: 'ACCEPT_ORDERS',
  UPDATE_ORDER_STATUS: 'UPDATE_ORDER_STATUS',
  VIEW_ORDER_DETAILS: 'VIEW_ORDER_DETAILS',
  CONFIRM_PAYMENT: 'CONFIRM_PAYMENT',
  CONFIRM_MANUAL_PAYMENT: 'CONFIRM_MANUAL_PAYMENT',
  MANAGE_DELIVERY: 'MANAGE_DELIVERY',
  CONFIGURE_DELIVERY_ZONES: 'CONFIGURE_DELIVERY_ZONES',
  CONFIGURE_HOURS: 'CONFIGURE_HOURS',
  VIEW_REPORTS: 'VIEW_REPORTS',
  VIEW_BASIC_REPORTS: 'VIEW_BASIC_REPORTS',
} as const;

export type Permission = (typeof Permission)[keyof typeof Permission];

const PLATFORM_PERMISSIONS: Record<PlatformRole, Set<Permission>> = {
  [PlatformRole.USER]: new Set(),
  [PlatformRole.SUPER_ADMIN]: new Set([
    Permission.VIEW_TENANTS,
    Permission.ACTIVATE_TENANT,
    Permission.SUSPEND_TENANT,
    Permission.VIEW_GLOBAL_METRICS,
    Permission.ACCESS_SUPPORT_TOOLS,
    Permission.VIEW_ADMIN_LOGS,
  ]),
};

const TENANT_PERMISSIONS: Record<TenantRole, Set<Permission>> = {
  [TenantRole.OWNER]: new Set([
    Permission.CONFIGURE_STORE,
    Permission.EDIT_TENANT_INFO,
    Permission.MANAGE_TEAM,
    Permission.MANAGE_CATALOG,
    Permission.VIEW_ORDERS,
    Permission.MANAGE_ORDERS,
    Permission.ACCEPT_ORDERS,
    Permission.UPDATE_ORDER_STATUS,
    Permission.VIEW_ORDER_DETAILS,
    Permission.CONFIRM_PAYMENT,
    Permission.CONFIRM_MANUAL_PAYMENT,
    Permission.MANAGE_DELIVERY,
    Permission.CONFIGURE_DELIVERY_ZONES,
    Permission.CONFIGURE_HOURS,
    Permission.VIEW_REPORTS,
    Permission.VIEW_BASIC_REPORTS,
  ]),
  [TenantRole.MANAGER]: new Set([
    Permission.MANAGE_CATALOG,
    Permission.VIEW_ORDERS,
    Permission.MANAGE_ORDERS,
    Permission.ACCEPT_ORDERS,
    Permission.UPDATE_ORDER_STATUS,
    Permission.VIEW_ORDER_DETAILS,
    Permission.CONFIGURE_HOURS,
    Permission.CONFIGURE_DELIVERY_ZONES,
    Permission.VIEW_BASIC_REPORTS,
  ]),
  [TenantRole.ATTENDANT]: new Set([
    Permission.VIEW_ORDERS,
    Permission.ACCEPT_ORDERS,
    Permission.UPDATE_ORDER_STATUS,
    Permission.VIEW_ORDER_DETAILS,
    Permission.CONFIRM_MANUAL_PAYMENT,
  ]),
};

export function hasPlatformPermission(role: PlatformRole, permission: Permission): boolean {
  return PLATFORM_PERMISSIONS[role].has(permission);
}

export function hasTenantPermission(role: TenantRole, permission: Permission): boolean {
  return TENANT_PERMISSIONS[role].has(permission);
}

export function getPlatformPermissions(role: PlatformRole): Permission[] {
  return [...PLATFORM_PERMISSIONS[role]];
}

export function getTenantPermissions(role: TenantRole): Permission[] {
  return [...TENANT_PERMISSIONS[role]];
}

export function isTenantAdmin(role: TenantRole): boolean {
  return role === TenantRole.OWNER || role === TenantRole.MANAGER;
}

export function isSuperAdmin(role: PlatformRole): boolean {
  return role === PlatformRole.SUPER_ADMIN;
}

const TENANT_ROLE_HIERARCHY: Record<TenantRole, number> = {
  [TenantRole.OWNER]: 80,
  [TenantRole.MANAGER]: 60,
  [TenantRole.ATTENDANT]: 40,
};

export function isTenantRoleAtLeast(role: TenantRole, minimumRole: TenantRole): boolean {
  return TENANT_ROLE_HIERARCHY[role] >= TENANT_ROLE_HIERARCHY[minimumRole];
}

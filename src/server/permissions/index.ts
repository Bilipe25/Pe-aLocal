// =============================================================================
// Permissões e Roles — PedidoLocal
// =============================================================================
// Define os perfis do sistema e as permissões de cada um.
// Toda verificação de permissão no servidor usa estas definições.
// =============================================================================

/**
 * Perfis do sistema.
 * Devem coincidir com o enum Role do Prisma.
 */
export const Role = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  OWNER: 'OWNER',
  MANAGER: 'MANAGER',
  ATTENDANT: 'ATTENDANT',
} as const;

export type Role = (typeof Role)[keyof typeof Role];

/**
 * Permissões granulares do sistema.
 */
export const Permission = {
  // Tenants
  VIEW_TENANTS: 'VIEW_TENANTS',
  ACTIVATE_TENANT: 'ACTIVATE_TENANT',
  SUSPEND_TENANT: 'SUSPEND_TENANT',
  VIEW_GLOBAL_METRICS: 'VIEW_GLOBAL_METRICS',
  ACCESS_SUPPORT_TOOLS: 'ACCESS_SUPPORT_TOOLS',
  VIEW_ADMIN_LOGS: 'VIEW_ADMIN_LOGS',

  // Loja
  CONFIGURE_STORE: 'CONFIGURE_STORE',
  EDIT_TENANT_INFO: 'EDIT_TENANT_INFO',

  // Equipe
  MANAGE_TEAM: 'MANAGE_TEAM',

  // Catálogo
  MANAGE_CATALOG: 'MANAGE_CATALOG',

  // Pedidos
  VIEW_ORDERS: 'VIEW_ORDERS',
  MANAGE_ORDERS: 'MANAGE_ORDERS',
  ACCEPT_ORDERS: 'ACCEPT_ORDERS',
  UPDATE_ORDER_STATUS: 'UPDATE_ORDER_STATUS',
  VIEW_ORDER_DETAILS: 'VIEW_ORDER_DETAILS',

  // Pagamentos
  CONFIRM_PAYMENT: 'CONFIRM_PAYMENT',
  CONFIRM_MANUAL_PAYMENT: 'CONFIRM_MANUAL_PAYMENT',

  // Entrega
  MANAGE_DELIVERY: 'MANAGE_DELIVERY',
  CONFIGURE_DELIVERY_ZONES: 'CONFIGURE_DELIVERY_ZONES',

  // Horários
  CONFIGURE_HOURS: 'CONFIGURE_HOURS',

  // Relatórios
  VIEW_REPORTS: 'VIEW_REPORTS',
  VIEW_BASIC_REPORTS: 'VIEW_BASIC_REPORTS',
} as const;

export type Permission = (typeof Permission)[keyof typeof Permission];

/**
 * Mapeamento de permissões por role.
 */
const ROLE_PERMISSIONS: Record<Role, Set<Permission>> = {
  [Role.SUPER_ADMIN]: new Set([
    Permission.VIEW_TENANTS,
    Permission.ACTIVATE_TENANT,
    Permission.SUSPEND_TENANT,
    Permission.VIEW_GLOBAL_METRICS,
    Permission.ACCESS_SUPPORT_TOOLS,
    Permission.VIEW_ADMIN_LOGS,
  ]),

  [Role.OWNER]: new Set([
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

  [Role.MANAGER]: new Set([
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

  [Role.ATTENDANT]: new Set([
    Permission.VIEW_ORDERS,
    Permission.ACCEPT_ORDERS,
    Permission.UPDATE_ORDER_STATUS,
    Permission.VIEW_ORDER_DETAILS,
    Permission.CONFIRM_MANUAL_PAYMENT,
  ]),
};

/**
 * Verifica se um role possui uma permissão específica.
 */
export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.has(permission) ?? false;
}

/**
 * Retorna todas as permissões de um role.
 */
export function getPermissions(role: Role): Permission[] {
  return [...(ROLE_PERMISSIONS[role] ?? [])];
}

/**
 * Verifica se um role é de nível administrativo (tenant).
 */
export function isTenantAdmin(role: Role): boolean {
  return role === Role.OWNER || role === Role.MANAGER;
}

/**
 * Verifica se é super admin (plataforma).
 */
export function isSuperAdmin(role: Role): boolean {
  return role === Role.SUPER_ADMIN;
}

/**
 * Hierarquia de roles para comparação.
 * Número maior = mais permissões.
 */
const ROLE_HIERARCHY: Record<Role, number> = {
  [Role.SUPER_ADMIN]: 100,
  [Role.OWNER]: 80,
  [Role.MANAGER]: 60,
  [Role.ATTENDANT]: 40,
};

/**
 * Verifica se roleA tem nível igual ou superior a roleB.
 */
export function isRoleAtLeast(roleA: Role, roleB: Role): boolean {
  return (ROLE_HIERARCHY[roleA] ?? 0) >= (ROLE_HIERARCHY[roleB] ?? 0);
}

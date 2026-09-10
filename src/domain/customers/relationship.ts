export const RELATIONSHIP_DAY_MS = 24 * 60 * 60 * 1_000;
export const RELATIONSHIP_RECOVERED_WINDOW_DAYS = 30;
export const RELATIONSHIP_DEFAULT_INACTIVE_DAYS = 30;
export const RELATIONSHIP_FREQUENT_MIN_ORDERS = 5;
export const RELATIONSHIP_FREQUENT_MAX_INTERVAL_DAYS = 14;

export type CustomerRelationshipSegment =
  'NEW' | 'RETURNING' | 'RECURRING' | 'FREQUENT' | 'COOLING' | 'INACTIVE' | 'RECOVERED';

export const CUSTOMER_RELATIONSHIP_LABELS: Record<CustomerRelationshipSegment, string> = {
  NEW: 'Novo',
  RETURNING: 'Voltou',
  RECURRING: 'Recorrente',
  FREQUENT: 'Frequente',
  COOLING: 'Está sumindo',
  INACTIVE: 'Não pede há algum tempo',
  RECOVERED: 'Voltou recentemente',
};

export function relationshipDaysSince(date: Date, now = new Date()) {
  return Math.max(0, Math.floor((now.getTime() - date.getTime()) / RELATIONSHIP_DAY_MS));
}

/**
 * Regras determinísticas da V3.
 *
 * Com três ou mais compras, o atraso é comparado ao intervalo habitual da pessoa:
 * - "Está sumindo": 1,5x o intervalo médio, com piso de 7 dias;
 * - "Inativo": 2,5x o intervalo médio, com piso de 14 dias.
 *
 * Com histórico insuficiente, usamos o fallback da loja (30 dias nesta versão) e
 * começamos o aviso em 70% desse período. Nenhum telefone participa do cálculo.
 */
export function getCustomerRelationshipThresholds(input: {
  completedOrderCount: number;
  averageDaysBetweenOrders: number | null;
  fallbackInactiveDays?: number;
}) {
  const fallbackInactiveDays = Math.min(
    180,
    Math.max(14, Math.round(input.fallbackInactiveDays ?? RELATIONSHIP_DEFAULT_INACTIVE_DAYS)),
  );
  const hasHabit =
    input.completedOrderCount >= 3 &&
    input.averageDaysBetweenOrders != null &&
    Number.isFinite(input.averageDaysBetweenOrders) &&
    input.averageDaysBetweenOrders > 0;

  if (!hasHabit) {
    return {
      mode: 'FALLBACK' as const,
      coolingAfterDays: Math.max(7, Math.floor(fallbackInactiveDays * 0.7)),
      inactiveAfterDays: fallbackInactiveDays,
    };
  }

  const averageDays = input.averageDaysBetweenOrders!;
  const coolingAfterDays = Math.max(7, Math.ceil(averageDays * 1.5));
  const inactiveAfterDays = Math.max(14, coolingAfterDays + 1, Math.ceil(averageDays * 2.5));
  return { mode: 'AUTOMATIC' as const, coolingAfterDays, inactiveAfterDays };
}

export function deriveCustomerRelationshipSegment(input: {
  completedOrderCount: number;
  lastCompletedOrderAt: Date;
  averageDaysBetweenOrders: number | null;
  recoveredAt?: Date | null;
  fallbackInactiveDays?: number;
  now?: Date;
}): CustomerRelationshipSegment {
  const now = input.now ?? new Date();
  if (
    input.recoveredAt &&
    relationshipDaysSince(input.recoveredAt, now) < RELATIONSHIP_RECOVERED_WINDOW_DAYS
  ) {
    return 'RECOVERED';
  }

  const thresholds = getCustomerRelationshipThresholds(input);
  const lastOrderDaysAgo = relationshipDaysSince(input.lastCompletedOrderAt, now);
  if (lastOrderDaysAgo >= thresholds.inactiveAfterDays) return 'INACTIVE';
  if (lastOrderDaysAgo >= thresholds.coolingAfterDays) return 'COOLING';
  if (input.completedOrderCount <= 1) return 'NEW';
  if (input.completedOrderCount === 2) return 'RETURNING';
  if (
    input.completedOrderCount >= RELATIONSHIP_FREQUENT_MIN_ORDERS &&
    input.averageDaysBetweenOrders != null &&
    input.averageDaysBetweenOrders <= RELATIONSHIP_FREQUENT_MAX_INTERVAL_DAYS
  ) {
    return 'FREQUENT';
  }
  return 'RECURRING';
}

export function isRelationshipAttentionSegment(segment: CustomerRelationshipSegment) {
  return segment === 'COOLING' || segment === 'INACTIVE';
}

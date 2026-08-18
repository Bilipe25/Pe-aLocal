export const ORDER_OPERATIONAL_SLA_WARNING_MINUTES = 2;
export const ORDER_OPERATIONAL_SLA_CRITICAL_MINUTES = 4;

export type OrderOperationalSlaStage = 'NONE' | 'NORMAL' | 'WARNING' | 'CRITICAL';
export type PersistedOrderOperationalSlaStage = Exclude<
  OrderOperationalSlaStage,
  'NONE' | 'NORMAL'
>;

export interface OrderOperationalSlaConfig {
  enabled: boolean;
  enabledAt: Date | null;
}

export interface OrderOperationalSlaInput {
  status: string;
  statusChangedAt: Date;
  config: OrderOperationalSlaConfig;
}

export function isOrderOperationalSlaEligible(input: OrderOperationalSlaInput): boolean {
  return Boolean(
    input.status === 'PENDING' &&
    input.config.enabled &&
    input.config.enabledAt &&
    input.statusChangedAt.getTime() >= input.config.enabledAt.getTime(),
  );
}

export function getOrderOperationalSlaElapsedSeconds(actionableAt: Date, now = new Date()): number {
  return Math.max(0, Math.floor((now.getTime() - actionableAt.getTime()) / 1_000));
}

export function getOrderOperationalSlaStage(
  input: OrderOperationalSlaInput,
  now = new Date(),
): OrderOperationalSlaStage {
  if (!isOrderOperationalSlaEligible(input)) return 'NONE';

  const elapsedSeconds = getOrderOperationalSlaElapsedSeconds(input.statusChangedAt, now);
  if (elapsedSeconds >= ORDER_OPERATIONAL_SLA_CRITICAL_MINUTES * 60) return 'CRITICAL';
  if (elapsedSeconds >= ORDER_OPERATIONAL_SLA_WARNING_MINUTES * 60) return 'WARNING';
  return 'NORMAL';
}

export function getDueOrderOperationalSlaAlertStage(
  input: OrderOperationalSlaInput,
  now = new Date(),
): PersistedOrderOperationalSlaStage | null {
  const stage = getOrderOperationalSlaStage(input, now);
  return stage === 'WARNING' || stage === 'CRITICAL' ? stage : null;
}

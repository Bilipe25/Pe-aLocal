export type CustomerClassification = 'NEW' | 'RECURRING' | 'LAPSED' | null;

export function classifyCustomer(input: {
  completedOrders: number;
  lastOrderAt: Date | null;
  now?: Date;
}): CustomerClassification {
  if (input.completedOrders <= 0 || !input.lastOrderAt) return null;
  if (input.completedOrders === 1) return 'NEW';
  const now = input.now ?? new Date();
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1_000);
  return input.lastOrderAt >= sixtyDaysAgo ? 'RECURRING' : 'LAPSED';
}

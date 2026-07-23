export interface IncomingOrderSignal {
  orderId: string;
  orderNumber: number;
  isNew: boolean;
}

export function collectOrderSignals(
  signals: IncomingOrderSignal[],
  notifiedOrderIds: Set<string>,
  maxRememberedOrders = 1_000,
) {
  const changedOrderIds = new Set<string>();
  const unseenNewOrders: Array<{ orderId: string; orderNumber: number }> = [];

  for (const signal of signals) {
    if (!signal.isNew) {
      changedOrderIds.add(signal.orderId);
      continue;
    }
    if (notifiedOrderIds.has(signal.orderId)) continue;
    notifiedOrderIds.add(signal.orderId);
    changedOrderIds.add(signal.orderId);
    unseenNewOrders.push({ orderId: signal.orderId, orderNumber: signal.orderNumber });
  }

  while (notifiedOrderIds.size > maxRememberedOrders) {
    const oldest = notifiedOrderIds.values().next().value;
    if (!oldest) break;
    notifiedOrderIds.delete(oldest);
  }

  return { changedOrderIds: [...changedOrderIds], unseenNewOrders };
}

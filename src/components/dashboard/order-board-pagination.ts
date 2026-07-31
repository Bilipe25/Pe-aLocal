import type { OrderBoardLaneKey, OrderQueueItemDTO } from '@/types/order-query';

export interface LanePaginationState {
  revision: number;
  items: Partial<Record<OrderBoardLaneKey, OrderQueueItemDTO[]>>;
  cursors: Partial<Record<OrderBoardLaneKey, string | null>>;
  loadingLanes: Partial<Record<OrderBoardLaneKey, true>>;
  errorLanes: Partial<Record<OrderBoardLaneKey, true>>;
}

export function emptyLanePagination(revision: number): LanePaginationState {
  return { revision, items: {}, cursors: {}, loadingLanes: {}, errorLanes: {} };
}

export function lanePaginationForRevision(
  current: LanePaginationState,
  revision: number,
): LanePaginationState {
  return current.revision === revision ? current : emptyLanePagination(revision);
}

export function laneCursorForPagination(
  current: LanePaginationState,
  revision: number,
  lane: OrderBoardLaneKey,
  initialCursor: string | null,
) {
  if (current.revision !== revision) return initialCursor;
  return Object.prototype.hasOwnProperty.call(current.cursors, lane)
    ? (current.cursors[lane] ?? null)
    : initialCursor;
}

/**
 * An event does not carry the authoritative destination lane. When an item from
 * an appended page changes, discard that lane's local pages and cursor together.
 * The fresh first page can then provide a new cursor without leaving a hidden
 * hole after an exhausted cursor.
 */
export function resetChangedLanePages(
  current: LanePaginationState,
  orderIds: string[],
): LanePaginationState {
  if (orderIds.length === 0) return current;
  const changedIds = new Set(orderIds);
  const affectedLanes = (
    Object.entries(current.items) as Array<[OrderBoardLaneKey, OrderQueueItemDTO[] | undefined]>
  )
    .filter(([, items]) => items?.some((item) => changedIds.has(item.id)))
    .map(([lane]) => lane);
  if (affectedLanes.length === 0) return current;

  const items = { ...current.items };
  const cursors = { ...current.cursors };
  const loadingLanes = { ...current.loadingLanes };
  const errorLanes = { ...current.errorLanes };
  for (const lane of affectedLanes) {
    delete items[lane];
    delete cursors[lane];
    delete loadingLanes[lane];
    delete errorLanes[lane];
  }
  return {
    ...current,
    items,
    cursors,
    loadingLanes,
    errorLanes,
  };
}

export function appendLanePage(
  current: LanePaginationState,
  revision: number,
  lane: OrderBoardLaneKey,
  items: OrderQueueItemDTO[],
  nextCursor: string | null,
): LanePaginationState {
  if (current.revision !== revision) return current;
  const seen = new Set<string>();
  const merged = [...(current.items[lane] ?? []), ...items].filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
  const loadingLanes = { ...current.loadingLanes };
  const errorLanes = { ...current.errorLanes };
  delete loadingLanes[lane];
  delete errorLanes[lane];
  return {
    ...current,
    items: { ...current.items, [lane]: merged },
    cursors: { ...current.cursors, [lane]: nextCursor },
    loadingLanes,
    errorLanes,
  };
}

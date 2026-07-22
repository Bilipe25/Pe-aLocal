BEGIN;

SET LOCAL lock_timeout = '5s';
-- Prevent store deletion while counter rows are inserted; order writes continue.
LOCK TABLE public.stores IN SHARE MODE;

-- The unique (storeId, orderNumber) index makes this one indexed lookup per store.
INSERT INTO public.store_order_counters AS counter ("storeId", "lastNumber")
SELECT stores.id, COALESCE((
  SELECT orders."orderNumber"
  FROM public.orders
  WHERE orders."storeId" = stores.id
  ORDER BY orders."orderNumber" DESC
  LIMIT 1
), 0)
FROM public.stores
ON CONFLICT ("storeId") DO UPDATE
  SET "lastNumber" = GREATEST(counter."lastNumber", EXCLUDED."lastNumber");

ALTER TABLE public.orders
  VALIDATE CONSTRAINT "orders_orderNumber_positive_check";

COMMIT;

-- Rollback: no data rollback is required; the cutover reconciles counters again.

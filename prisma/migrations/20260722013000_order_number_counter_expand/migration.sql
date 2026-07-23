-- Deployment order: apply expand, backfill and cutover before publishing the
-- application version that omits orderNumber on insert.
BEGIN;

SET LOCAL lock_timeout = '5s';

CREATE TABLE public.store_order_counters (
  "storeId" TEXT NOT NULL,
  "lastNumber" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "store_order_counters_pkey" PRIMARY KEY ("storeId"),
  CONSTRAINT "store_order_counters_lastNumber_check" CHECK ("lastNumber" >= 0),
  CONSTRAINT "store_order_counters_storeId_fkey"
    FOREIGN KEY ("storeId") REFERENCES public.stores(id)
    ON DELETE CASCADE ON UPDATE CASCADE
);

ALTER TABLE public.orders
  ADD COLUMN "idempotencyFingerprint" TEXT,
  ALTER COLUMN "orderNumber" SET DEFAULT 0,
  ADD CONSTRAINT "orders_orderNumber_positive_check"
    CHECK ("orderNumber" > 0) NOT VALID;

ALTER TABLE public.store_order_counters ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public.store_order_counters FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public.store_order_counters FROM authenticated;
  END IF;
END $$;

COMMIT;

-- Rollback: drop the positive check/default/fingerprint column, then the counter table.

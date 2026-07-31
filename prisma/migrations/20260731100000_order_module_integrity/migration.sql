-- Defense-in-depth and tenant/store integrity for the order module.
-- Operational rollback is application-only: the previous application remains
-- compatible with RLS and the composite foreign key.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

ALTER TABLE public.order_internal_notes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.order_internal_notes FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.orders AS orders
    LEFT JOIN public.stores AS stores
      ON stores.id = orders."storeId"
    WHERE stores.id IS NULL
       OR stores."tenantId" IS DISTINCT FROM orders."tenantId"
  ) THEN
    RAISE EXCEPTION
      'Order module preflight failed: orders reference a missing store or a store from another tenant'
      USING ERRCODE = '23514';
  END IF;
END;
$$;

ALTER TABLE public.orders
  ADD CONSTRAINT "orders_storeId_tenantId_fkey"
  FOREIGN KEY ("storeId", "tenantId")
  REFERENCES public.stores("id", "tenantId")
  ON DELETE CASCADE
  ON UPDATE CASCADE
  NOT VALID;

ALTER TABLE public.orders
  VALIDATE CONSTRAINT "orders_storeId_tenantId_fkey";

ALTER TABLE public.orders
  DROP CONSTRAINT "orders_storeId_fkey";

COMMIT;

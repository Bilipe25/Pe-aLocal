BEGIN;

SET LOCAL lock_timeout = '5s';

CREATE FUNCTION public.assign_store_order_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
  INSERT INTO public.store_order_counters AS counter ("storeId", "lastNumber")
  VALUES (NEW."storeId", 1)
  ON CONFLICT ("storeId") DO UPDATE
    SET "lastNumber" = counter."lastNumber" + 1
  RETURNING "lastNumber" INTO NEW."orderNumber";

  RETURN NEW;
END;
$$;

CREATE FUNCTION public.prevent_order_number_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW."storeId" IS DISTINCT FROM OLD."storeId"
    OR NEW."orderNumber" IS DISTINCT FROM OLD."orderNumber" THEN
    RAISE EXCEPTION 'storeId and orderNumber are immutable after order creation'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

-- Lock parents before children to avoid deadlocks with store deletion cascades.
LOCK TABLE public.stores IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.orders IN SHARE ROW EXCLUSIVE MODE;

-- Reconcile orders created after the online backfill, then install the trigger.
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

CREATE TRIGGER orders_assign_order_number
BEFORE INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.assign_store_order_number();

CREATE TRIGGER orders_prevent_number_change
BEFORE UPDATE OF "storeId", "orderNumber" ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.prevent_order_number_change();

REVOKE ALL ON FUNCTION public.assign_store_order_number() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prevent_order_number_change() FROM PUBLIC;

COMMIT;

-- Rollback requires deploying the previous application version first because it
-- still supplies orderNumber explicitly.
-- DROP TRIGGER orders_prevent_number_change ON public.orders;
-- DROP TRIGGER orders_assign_order_number ON public.orders;
-- DROP FUNCTION public.prevent_order_number_change();
-- DROP FUNCTION public.assign_store_order_number();
-- ALTER TABLE public.orders DROP CONSTRAINT "orders_orderNumber_positive_check";
-- ALTER TABLE public.orders ALTER COLUMN "orderNumber" DROP DEFAULT;
-- ALTER TABLE public.orders DROP COLUMN "idempotencyFingerprint";
-- DROP TABLE public.store_order_counters;

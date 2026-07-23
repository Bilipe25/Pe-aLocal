BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.orders AS orders
    LEFT JOIN public.payments AS payments ON payments."orderId" = orders.id
    WHERE payments.id IS NULL
      OR payments.status IS DISTINCT FROM orders."paymentStatus"
      OR payments.method IS DISTINCT FROM orders."paymentMethod"
      OR payments.amount IS DISTINCT FROM orders.total
  ) THEN
    RAISE EXCEPTION 'order/payment consistency precondition failed'
      USING ERRCODE = '23514';
  END IF;
END $$;

CREATE FUNCTION public.assert_order_payment_consistency()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  target_order_id TEXT;
  previous_order_id TEXT;
BEGIN
  IF TG_TABLE_NAME = 'orders' THEN
    target_order_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;
  ELSE
    target_order_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."orderId" ELSE NEW."orderId" END;
    IF TG_OP = 'UPDATE' AND OLD."orderId" IS DISTINCT FROM NEW."orderId" THEN
      previous_order_id := OLD."orderId";
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM public.orders WHERE id = target_order_id)
    AND NOT EXISTS (
      SELECT 1
      FROM public.orders AS orders
      JOIN public.payments AS payments ON payments."orderId" = orders.id
      WHERE orders.id = target_order_id
        AND payments.status = orders."paymentStatus"
        AND payments.method = orders."paymentMethod"
        AND payments.amount = orders.total
    ) THEN
    RAISE EXCEPTION 'Order % and payment are inconsistent', target_order_id
      USING ERRCODE = '23514';
  END IF;

  IF previous_order_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.orders WHERE id = previous_order_id)
    AND NOT EXISTS (
      SELECT 1
      FROM public.orders AS orders
      JOIN public.payments AS payments ON payments."orderId" = orders.id
      WHERE orders.id = previous_order_id
        AND payments.status = orders."paymentStatus"
        AND payments.method = orders."paymentMethod"
        AND payments.amount = orders.total
    ) THEN
    RAISE EXCEPTION 'Order % and payment are inconsistent', previous_order_id
      USING ERRCODE = '23514';
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_order_payment_consistency() FROM PUBLIC;

CREATE CONSTRAINT TRIGGER "orders_payment_consistency_check"
AFTER INSERT OR UPDATE ON public.orders
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION public.assert_order_payment_consistency();

CREATE CONSTRAINT TRIGGER "payments_order_consistency_check"
AFTER INSERT OR UPDATE OR DELETE ON public.payments
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION public.assert_order_payment_consistency();

COMMIT;

-- Rollback: remova triggers e função antes de qualquer código que deixe de
-- realizar dual-write. Colunas e histórico permanecem para preservar evidência.

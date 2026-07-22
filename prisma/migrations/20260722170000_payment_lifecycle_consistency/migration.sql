BEGIN;

SET LOCAL lock_timeout = '5s';

ALTER TABLE public.payments
  ADD COLUMN "reportedAt" TIMESTAMP(3),
  ADD COLUMN "failedAt" TIMESTAMP(3),
  ADD COLUMN "failureReasonCode" VARCHAR(64),
  ADD COLUMN "failureNote" VARCHAR(500),
  ADD COLUMN "cancelledAt" TIMESTAMP(3),
  ADD COLUMN "refundedAt" TIMESTAMP(3),
  ADD COLUMN "refundedBy" TEXT,
  ADD COLUMN "refundReasonCode" VARCHAR(64),
  ADD COLUMN "refundNote" VARCHAR(500),
  ADD COLUMN "refundAmount" INTEGER;

-- Estados históricos não possuem timestamps próprios. updatedAt é o melhor
-- limite conhecido e evita inventar uma precisão inexistente.
UPDATE public.payments
SET "reportedAt" = COALESCE("reportedAt", "updatedAt")
WHERE status = 'CUSTOMER_REPORTED_PAID';

UPDATE public.payments
SET "failedAt" = COALESCE("failedAt", "updatedAt")
WHERE status = 'FAILED';

UPDATE public.payments
SET "cancelledAt" = COALESCE("cancelledAt", "updatedAt")
WHERE status = 'CANCELLED';

UPDATE public.payments
SET "paidAt" = COALESCE("paidAt", "updatedAt"),
    "refundedAt" = COALESCE("refundedAt", "updatedAt"),
    "refundAmount" = COALESCE("refundAmount", amount),
    "refundReasonCode" = COALESCE("refundReasonCode", 'LEGACY')
WHERE status = 'REFUNDED';

UPDATE public.payments
SET "paidAt" = COALESCE("paidAt", "updatedAt")
WHERE status = 'PAID';

ALTER TABLE public.payments
  ADD CONSTRAINT "payments_amount_nonnegative_check"
    CHECK (amount >= 0),
  ADD CONSTRAINT "payments_refund_amount_check"
    CHECK (
      "refundAmount" IS NULL
      OR ("refundAmount" > 0 AND "refundAmount" <= amount)
    ),
  ADD CONSTRAINT "payments_lifecycle_metadata_check"
    CHECK (
      (status <> 'CUSTOMER_REPORTED_PAID' OR "reportedAt" IS NOT NULL)
      AND (status <> 'FAILED' OR "failedAt" IS NOT NULL)
      AND (status <> 'CANCELLED' OR "cancelledAt" IS NOT NULL)
      AND (status NOT IN ('PAID', 'REFUNDED') OR "paidAt" IS NOT NULL)
      AND (
        status <> 'REFUNDED'
        OR (
          "refundedAt" IS NOT NULL
          AND "refundAmount" = amount
          AND "refundReasonCode" IS NOT NULL
        )
      )
    );

-- O deploy deve parar antes de instalar o trigger se houver divergência.
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
    IF TG_OP = 'DELETE' THEN
      target_order_id := OLD.id;
    ELSE
      target_order_id := NEW.id;
    END IF;
  ELSE
    IF TG_OP = 'DELETE' THEN
      target_order_id := OLD."orderId";
    ELSE
      target_order_id := NEW."orderId";
    END IF;

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

-- Rollback de código primeiro. Depois:
-- DROP TRIGGER "payments_order_consistency_check" ON public.payments;
-- DROP TRIGGER "orders_payment_consistency_check" ON public.orders;
-- DROP FUNCTION public.assert_order_payment_consistency();
-- ALTER TABLE public.payments DROP CONSTRAINT "payments_lifecycle_metadata_check";
-- ALTER TABLE public.payments DROP CONSTRAINT "payments_refund_amount_check";
-- ALTER TABLE public.payments DROP CONSTRAINT "payments_amount_nonnegative_check";
-- As colunas devem permanecer durante a janela de rollback para não perder auditoria financeira.

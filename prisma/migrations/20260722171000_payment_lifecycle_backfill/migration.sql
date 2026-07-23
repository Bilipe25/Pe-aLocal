BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

UPDATE public.payments
SET "reportedAt" = COALESCE("reportedAt", "updatedAt")
WHERE status = 'CUSTOMER_REPORTED_PAID';

UPDATE public.payments
SET "failedAt" = COALESCE("failedAt", "updatedAt"),
    "failureReasonCode" = COALESCE("failureReasonCode", 'LEGACY')
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

INSERT INTO public.payment_status_history (
  id,
  "tenantId",
  "storeId",
  "orderId",
  "paymentId",
  "fromStatus",
  "toStatus",
  "actorNameSnapshot",
  source,
  note,
  "orderVersionTo",
  "createdAt"
)
SELECT
  gen_random_uuid()::text,
  orders."tenantId",
  orders."storeId",
  orders.id,
  payments.id,
  NULL,
  payments.status,
  'Migração do sistema',
  'SYSTEM',
  'Estado financeiro existente no início do histórico estruturado.',
  orders.version,
  payments."updatedAt"
FROM public.payments AS payments
JOIN public.orders AS orders ON orders.id = payments."orderId"
WHERE NOT EXISTS (
  SELECT 1
  FROM public.payment_status_history AS history
  WHERE history."paymentId" = payments.id
);

ALTER TABLE public.payments
  ADD CONSTRAINT "payments_amount_nonnegative_check"
    CHECK (amount >= 0) NOT VALID,
  ADD CONSTRAINT "payments_refund_amount_check"
    CHECK (
      "refundAmount" IS NULL
      OR "refundAmount" = amount
    ) NOT VALID,
  ADD CONSTRAINT "payments_lifecycle_metadata_check"
    CHECK (
      (status <> 'CUSTOMER_REPORTED_PAID' OR "reportedAt" IS NOT NULL)
      AND (status <> 'PAID' OR "paidAt" IS NOT NULL)
      AND (
        status <> 'FAILED'
        OR ("failedAt" IS NOT NULL AND "failureReasonCode" IS NOT NULL)
      )
      AND (status <> 'CANCELLED' OR "cancelledAt" IS NOT NULL)
      AND (
        status <> 'REFUNDED'
        OR (
          "paidAt" IS NOT NULL
          AND "refundedAt" IS NOT NULL
          AND "refundReasonCode" IS NOT NULL
          AND "refundAmount" IS NOT NULL
          AND "refundAmount" = amount
        )
      )
    ) NOT VALID;

ALTER TABLE public.payments
  VALIDATE CONSTRAINT "payments_amount_nonnegative_check";
ALTER TABLE public.payments
  VALIDATE CONSTRAINT "payments_refund_amount_check";
ALTER TABLE public.payments
  VALIDATE CONSTRAINT "payments_lifecycle_metadata_check";

COMMIT;

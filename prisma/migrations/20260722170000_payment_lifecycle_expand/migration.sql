BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE public.orders
  ADD COLUMN "paymentReportToken" TEXT DEFAULT gen_random_uuid()::text,
  ADD COLUMN "paymentReportExpiresAt" TIMESTAMP(3);

UPDATE public.orders
SET "paymentReportExpiresAt" = "createdAt" + INTERVAL '7 days'
WHERE "paymentReportExpiresAt" IS NULL;

ALTER TABLE public.orders
  ALTER COLUMN "paymentReportToken" SET NOT NULL,
  ALTER COLUMN "paymentReportExpiresAt" SET DEFAULT (CURRENT_TIMESTAMP + INTERVAL '7 days'),
  ALTER COLUMN "paymentReportExpiresAt" SET NOT NULL;

CREATE UNIQUE INDEX "orders_paymentReportToken_key"
  ON public.orders("paymentReportToken");

COMMIT;

-- Defaults mantêm o checkout do Worker anterior compatível durante o rollout.

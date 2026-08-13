BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TYPE "CouponReservationStatus" AS ENUM ('ACTIVE', 'CONSUMED', 'RELEASED', 'EXPIRED');
CREATE TYPE "PaymentProviderAlertPriority" AS ENUM ('HIGH', 'CRITICAL');
CREATE TYPE "PaymentProviderAlertStatus" AS ENUM ('OPEN', 'RESOLVED');

ALTER TABLE "orders" ADD COLUMN "operationalStartedAt" TIMESTAMP(3);

ALTER TABLE "payment_provider_webhook_events"
  ADD COLUMN "providerObjectId" VARCHAR(150),
  ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "processingStartedAt" TIMESTAMP(3),
  ADD COLUMN "lastErrorCode" VARCHAR(64);

CREATE INDEX "payment_provider_webhook_events_provider_processedAt_availableAt_createdAt_idx"
  ON "payment_provider_webhook_events"("provider", "processedAt", "availableAt", "createdAt");

CREATE TABLE "coupon_reservations" (
  "id" TEXT NOT NULL,
  "couponId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "discount" INTEGER NOT NULL,
  "status" "CouponReservationStatus" NOT NULL DEFAULT 'ACTIVE',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "releasedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "coupon_reservations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "coupon_reservations_discount_check" CHECK ("discount" >= 0),
  CONSTRAINT "coupon_reservations_terminal_timestamp_check" CHECK (
    ("status" = 'CONSUMED' AND "consumedAt" IS NOT NULL AND "releasedAt" IS NULL)
    OR ("status" IN ('RELEASED', 'EXPIRED') AND "releasedAt" IS NOT NULL AND "consumedAt" IS NULL)
    OR ("status" = 'ACTIVE' AND "consumedAt" IS NULL AND "releasedAt" IS NULL)
  )
);

CREATE UNIQUE INDEX "coupon_reservations_orderId_key" ON "coupon_reservations"("orderId");
CREATE UNIQUE INDEX "coupon_reservations_couponId_orderId_key" ON "coupon_reservations"("couponId", "orderId");
CREATE INDEX "coupon_reservations_couponId_status_expiresAt_idx" ON "coupon_reservations"("couponId", "status", "expiresAt");
CREATE INDEX "coupon_reservations_status_expiresAt_idx" ON "coupon_reservations"("status", "expiresAt");

ALTER TABLE "coupon_reservations"
  ADD CONSTRAINT "coupon_reservations_couponId_fkey"
    FOREIGN KEY ("couponId") REFERENCES "coupons"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "coupon_reservations_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "payment_provider_alerts" (
  "id" TEXT NOT NULL,
  "provider" "PaymentProvider" NOT NULL,
  "dedupeKey" VARCHAR(200) NOT NULL,
  "priority" "PaymentProviderAlertPriority" NOT NULL,
  "status" "PaymentProviderAlertStatus" NOT NULL DEFAULT 'OPEN',
  "tenantId" TEXT,
  "storeId" TEXT,
  "orderId" TEXT,
  "paymentId" TEXT,
  "mercadoPagoPaymentId" TEXT,
  "code" VARCHAR(64) NOT NULL,
  "occurrenceCount" INTEGER NOT NULL DEFAULT 1,
  "firstOccurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastOccurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_provider_alerts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payment_provider_alerts_occurrence_count_check" CHECK ("occurrenceCount" > 0)
);

CREATE UNIQUE INDEX "payment_provider_alerts_provider_dedupeKey_key" ON "payment_provider_alerts"("provider", "dedupeKey");
CREATE INDEX "payment_provider_alerts_status_priority_lastOccurredAt_idx" ON "payment_provider_alerts"("status", "priority", "lastOccurredAt");
CREATE INDEX "payment_provider_alerts_tenantId_storeId_status_lastOccurredAt_idx" ON "payment_provider_alerts"("tenantId", "storeId", "status", "lastOccurredAt");
CREATE INDEX "payment_provider_alerts_orderId_idx" ON "payment_provider_alerts"("orderId");
CREATE INDEX "payment_provider_alerts_paymentId_idx" ON "payment_provider_alerts"("paymentId");

ALTER TABLE "coupon_reservations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payment_provider_alerts" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE "coupon_reservations" FROM anon;
    REVOKE ALL ON TABLE "payment_provider_alerts" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "coupon_reservations" FROM authenticated;
    REVOKE ALL ON TABLE "payment_provider_alerts" FROM authenticated;
  END IF;
END $$;

COMMIT;

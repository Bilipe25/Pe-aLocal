-- Entitlement activation watermark prevents retroactive SLA alerts.
ALTER TABLE "store_entitlements"
  ADD COLUMN "operationalSlaEnabledAt" TIMESTAMP(3);

UPDATE "store_entitlements"
SET "operationalSlaEnabledAt" = CURRENT_TIMESTAMP
WHERE "operationalSlaEnabled" = true;

CREATE TYPE "OrderOperationalSlaStage" AS ENUM ('WARNING', 'CRITICAL');

CREATE TABLE "order_operational_sla_alerts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "actionableAt" TIMESTAMP(3) NOT NULL,
  "stage" "OrderOperationalSlaStage" NOT NULL,
  "triggeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "order_operational_sla_alerts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "order_operational_sla_deliveries" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "slaAlertId" UUID NOT NULL,
  "storeStaffPushSubscriptionId" TEXT NOT NULL,
  "webPushSubscriptionId" TEXT NOT NULL,
  "status" "WebPushDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lockedAt" TIMESTAMP(3),
  "lockToken" UUID,
  "sentAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "lastStatusCode" INTEGER,
  "lastError" VARCHAR(1000),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "order_operational_sla_deliveries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "order_operational_sla_deliveries_attempts_check" CHECK ("attempts" >= 0)
);

CREATE UNIQUE INDEX "order_operational_sla_alerts_cycle_stage_key"
  ON "order_operational_sla_alerts"("orderId", "actionableAt", "stage");
CREATE UNIQUE INDEX "order_operational_sla_alerts_scope_key"
  ON "order_operational_sla_alerts"("id", "tenantId", "storeId", "orderId");
CREATE INDEX "order_operational_sla_alerts_cycle_idx"
  ON "order_operational_sla_alerts"("tenantId", "storeId", "orderId", "actionableAt");
CREATE INDEX "order_operational_sla_alerts_resolution_idx"
  ON "order_operational_sla_alerts"("resolvedAt", "triggeredAt");

CREATE UNIQUE INDEX "order_operational_sla_deliveries_alert_device_key"
  ON "order_operational_sla_deliveries"("slaAlertId", "webPushSubscriptionId");
CREATE INDEX "order_operational_sla_deliveries_status_available_idx"
  ON "order_operational_sla_deliveries"("status", "availableAt", "createdAt");
CREATE INDEX "order_operational_sla_deliveries_alert_status_idx"
  ON "order_operational_sla_deliveries"("slaAlertId", "status");
CREATE INDEX "order_operational_sla_deliveries_staff_status_idx"
  ON "order_operational_sla_deliveries"("storeStaffPushSubscriptionId", "status");
CREATE INDEX "order_operational_sla_deliveries_device_status_idx"
  ON "order_operational_sla_deliveries"("webPushSubscriptionId", "status");

ALTER TABLE "order_operational_sla_alerts"
  ADD CONSTRAINT "order_operational_sla_alerts_tenant_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "order_operational_sla_alerts_store_fkey"
    FOREIGN KEY ("storeId", "tenantId") REFERENCES "stores"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "order_operational_sla_alerts_order_fkey"
    FOREIGN KEY ("orderId", "tenantId", "storeId") REFERENCES "orders"("id", "tenantId", "storeId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "order_operational_sla_deliveries"
  ADD CONSTRAINT "order_operational_sla_deliveries_tenant_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "order_operational_sla_deliveries_store_fkey"
    FOREIGN KEY ("storeId", "tenantId") REFERENCES "stores"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "order_operational_sla_deliveries_order_fkey"
    FOREIGN KEY ("orderId", "tenantId", "storeId") REFERENCES "orders"("id", "tenantId", "storeId") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "order_operational_sla_deliveries_alert_fkey"
    FOREIGN KEY ("slaAlertId", "tenantId", "storeId", "orderId") REFERENCES "order_operational_sla_alerts"("id", "tenantId", "storeId", "orderId") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "order_operational_sla_deliveries_staff_subscription_fkey"
    FOREIGN KEY ("storeStaffPushSubscriptionId", "tenantId", "storeId") REFERENCES "store_staff_push_subscriptions"("id", "tenantId", "storeId") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "order_operational_sla_deliveries_subscription_fkey"
    FOREIGN KEY ("webPushSubscriptionId") REFERENCES "web_push_subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "order_operational_sla_alerts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "order_operational_sla_deliveries" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "order_operational_sla_alerts" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE "order_operational_sla_deliveries" FROM PUBLIC, anon, authenticated;

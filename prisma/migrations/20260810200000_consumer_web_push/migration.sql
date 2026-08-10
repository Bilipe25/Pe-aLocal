BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TYPE "WebPushDispatchStatus" AS ENUM ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED');
CREATE TYPE "WebPushDeliveryStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'REVOKED', 'SKIPPED');

ALTER TABLE "order_outbox_events"
  ADD CONSTRAINT "order_outbox_events_id_tenantId_storeId_key"
  UNIQUE ("id", "tenantId", "storeId");

CREATE TABLE "web_push_subscriptions" (
  "id" TEXT NOT NULL,
  "endpoint" VARCHAR(4096) NOT NULL,
  "endpointHash" VARCHAR(64) NOT NULL,
  "p256dh" VARCHAR(256) NOT NULL,
  "auth" VARCHAR(128) NOT NULL,
  "origin" VARCHAR(255) NOT NULL,
  "expirationTime" TIMESTAMP(3),
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMP(3),
  "revokedReason" VARCHAR(120),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "web_push_subscriptions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "web_push_subscriptions_endpointHash_key" UNIQUE ("endpointHash"),
  CONSTRAINT "web_push_subscriptions_endpoint_hash_check" CHECK ("endpointHash" ~ '^[0-9a-f]{64}$')
);

CREATE TABLE "order_push_subscriptions" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "webPushSubscriptionId" TEXT NOT NULL,
  "enabledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "disabledAt" TIMESTAMP(3),
  "terminalNotifiedAt" TIMESTAMP(3),
  "lockedAt" TIMESTAMP(3),
  "lockToken" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "order_push_subscriptions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "order_push_subscriptions_orderId_webPushSubscriptionId_key" UNIQUE ("orderId", "webPushSubscriptionId"),
  CONSTRAINT "order_push_subscriptions_id_tenantId_storeId_orderId_key" UNIQUE ("id", "tenantId", "storeId", "orderId")
);

CREATE TABLE "web_push_dispatches" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "orderOutboxEventId" TEXT NOT NULL,
  "status" "WebPushDispatchStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lockedAt" TIMESTAMP(3),
  "lockToken" UUID,
  "processedAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "lastError" VARCHAR(1000),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "web_push_dispatches_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "web_push_dispatches_orderOutboxEventId_key" UNIQUE ("orderOutboxEventId"),
  CONSTRAINT "web_push_dispatches_id_tenantId_storeId_orderId_key" UNIQUE ("id", "tenantId", "storeId", "orderId")
);

CREATE TABLE "web_push_deliveries" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "orderOutboxEventId" TEXT NOT NULL,
  "webPushDispatchId" TEXT NOT NULL,
  "orderPushSubscriptionId" TEXT NOT NULL,
  "webPushSubscriptionId" TEXT NOT NULL,
  "orderStatus" "OrderStatus" NOT NULL,
  "aggregateVersion" INTEGER NOT NULL,
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
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "web_push_deliveries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "web_push_deliveries_orderOutboxEventId_webPushSubscriptionId_key" UNIQUE ("orderOutboxEventId", "webPushSubscriptionId")
);

CREATE INDEX "web_push_subscriptions_revokedAt_lastSeenAt_idx" ON "web_push_subscriptions" ("revokedAt", "lastSeenAt");
CREATE INDEX "order_push_subscriptions_tenantId_storeId_disabledAt_idx" ON "order_push_subscriptions" ("tenantId", "storeId", "disabledAt");
CREATE INDEX "order_push_subscriptions_webPushSubscriptionId_disabledAt_idx" ON "order_push_subscriptions" ("webPushSubscriptionId", "disabledAt");
CREATE INDEX "web_push_dispatches_status_availableAt_createdAt_idx" ON "web_push_dispatches" ("status", "availableAt", "createdAt");
CREATE INDEX "web_push_dispatches_orderId_createdAt_idx" ON "web_push_dispatches" ("orderId", "createdAt");
CREATE INDEX "web_push_deliveries_status_availableAt_createdAt_idx" ON "web_push_deliveries" ("status", "availableAt", "createdAt");
CREATE INDEX "web_push_deliveries_orderPushSubscriptionId_aggregateVersion_idx" ON "web_push_deliveries" ("orderPushSubscriptionId", "aggregateVersion");
CREATE INDEX "web_push_deliveries_webPushSubscriptionId_status_idx" ON "web_push_deliveries" ("webPushSubscriptionId", "status");
CREATE INDEX "order_outbox_events_web_push_projection_idx"
  ON "order_outbox_events" ("occurredAt", "id")
  WHERE "eventType" IN ('ORDER_ACCEPTED', 'ORDER_PREPARING', 'ORDER_READY', 'ORDER_DISPATCHED', 'ORDER_COMPLETED', 'ORDER_CANCELLED');

ALTER TABLE "order_push_subscriptions" ADD CONSTRAINT "order_push_subscriptions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "order_push_subscriptions" ADD CONSTRAINT "order_push_subscriptions_storeId_tenantId_fkey" FOREIGN KEY ("storeId", "tenantId") REFERENCES "stores"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "order_push_subscriptions" ADD CONSTRAINT "order_push_subscriptions_orderId_tenantId_storeId_fkey" FOREIGN KEY ("orderId", "tenantId", "storeId") REFERENCES "orders"("id", "tenantId", "storeId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "order_push_subscriptions" ADD CONSTRAINT "order_push_subscriptions_webPushSubscriptionId_fkey" FOREIGN KEY ("webPushSubscriptionId") REFERENCES "web_push_subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "web_push_dispatches" ADD CONSTRAINT "web_push_dispatches_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "web_push_dispatches" ADD CONSTRAINT "web_push_dispatches_storeId_tenantId_fkey" FOREIGN KEY ("storeId", "tenantId") REFERENCES "stores"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "web_push_dispatches" ADD CONSTRAINT "web_push_dispatches_orderId_tenantId_storeId_fkey" FOREIGN KEY ("orderId", "tenantId", "storeId") REFERENCES "orders"("id", "tenantId", "storeId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "web_push_dispatches" ADD CONSTRAINT "web_push_dispatches_orderOutboxEventId_fkey" FOREIGN KEY ("orderOutboxEventId") REFERENCES "order_outbox_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "web_push_deliveries" ADD CONSTRAINT "web_push_deliveries_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "web_push_deliveries" ADD CONSTRAINT "web_push_deliveries_storeId_tenantId_fkey" FOREIGN KEY ("storeId", "tenantId") REFERENCES "stores"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "web_push_deliveries" ADD CONSTRAINT "web_push_deliveries_orderId_tenantId_storeId_fkey" FOREIGN KEY ("orderId", "tenantId", "storeId") REFERENCES "orders"("id", "tenantId", "storeId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "web_push_deliveries" ADD CONSTRAINT "web_push_deliveries_orderOutboxEventId_tenantId_storeId_fkey" FOREIGN KEY ("orderOutboxEventId", "tenantId", "storeId") REFERENCES "order_outbox_events"("id", "tenantId", "storeId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "web_push_deliveries" ADD CONSTRAINT "web_push_deliveries_webPushDispatchId_tenantId_storeId_orderId_fkey" FOREIGN KEY ("webPushDispatchId", "tenantId", "storeId", "orderId") REFERENCES "web_push_dispatches"("id", "tenantId", "storeId", "orderId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "web_push_deliveries" ADD CONSTRAINT "web_push_deliveries_orderPushSubscriptionId_tenantId_storeId_orderId_fkey" FOREIGN KEY ("orderPushSubscriptionId", "tenantId", "storeId", "orderId") REFERENCES "order_push_subscriptions"("id", "tenantId", "storeId", "orderId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "web_push_deliveries" ADD CONSTRAINT "web_push_deliveries_webPushSubscriptionId_fkey" FOREIGN KEY ("webPushSubscriptionId") REFERENCES "web_push_subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "web_push_subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "order_push_subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "web_push_dispatches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "web_push_deliveries" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "web_push_subscriptions" FROM anon, authenticated;
REVOKE ALL ON TABLE "order_push_subscriptions" FROM anon, authenticated;
REVOKE ALL ON TABLE "web_push_dispatches" FROM anon, authenticated;
REVOKE ALL ON TABLE "web_push_deliveries" FROM anon, authenticated;

COMMIT;

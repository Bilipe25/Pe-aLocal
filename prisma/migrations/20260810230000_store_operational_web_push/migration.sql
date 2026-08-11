CREATE TABLE "store_staff_push_subscriptions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "storeId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "webPushSubscriptionId" UUID NOT NULL,
  "enabledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "disabledAt" TIMESTAMP(3),
  "disabledReason" VARCHAR(64),
  "lastConfirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lockedAt" TIMESTAMP(3),
  "lockToken" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "store_staff_push_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "store_web_push_dispatches" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "storeId" UUID NOT NULL,
  "orderId" UUID NOT NULL,
  "orderOutboxEventId" UUID NOT NULL,
  "status" "WebPushDispatchStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lockedAt" TIMESTAMP(3),
  "lockToken" UUID,
  "processedAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "lastError" VARCHAR(1000),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "store_web_push_dispatches_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "store_web_push_deliveries" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "storeId" UUID NOT NULL,
  "orderId" UUID NOT NULL,
  "orderOutboxEventId" UUID NOT NULL,
  "storeWebPushDispatchId" UUID NOT NULL,
  "storeStaffPushSubscriptionId" UUID NOT NULL,
  "webPushSubscriptionId" UUID NOT NULL,
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
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "store_web_push_deliveries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "store_staff_push_subscriptions_store_user_subscription_key"
  ON "store_staff_push_subscriptions"("storeId", "userId", "webPushSubscriptionId");
CREATE UNIQUE INDEX "store_staff_push_subscriptions_scope_key"
  ON "store_staff_push_subscriptions"("id", "tenantId", "storeId");
CREATE INDEX "store_staff_push_subscriptions_store_active_idx"
  ON "store_staff_push_subscriptions"("tenantId", "storeId", "disabledAt");
CREATE INDEX "store_staff_push_subscriptions_user_active_idx"
  ON "store_staff_push_subscriptions"("userId", "disabledAt");
CREATE INDEX "store_staff_push_subscriptions_device_active_idx"
  ON "store_staff_push_subscriptions"("webPushSubscriptionId", "disabledAt");

CREATE UNIQUE INDEX "store_web_push_dispatches_event_key"
  ON "store_web_push_dispatches"("orderOutboxEventId");
CREATE UNIQUE INDEX "store_web_push_dispatches_scope_key"
  ON "store_web_push_dispatches"("id", "tenantId", "storeId", "orderId");
CREATE INDEX "store_web_push_dispatches_status_available_idx"
  ON "store_web_push_dispatches"("status", "availableAt", "createdAt");
CREATE INDEX "store_web_push_dispatches_order_idx"
  ON "store_web_push_dispatches"("orderId", "createdAt");

CREATE UNIQUE INDEX "store_web_push_deliveries_event_device_key"
  ON "store_web_push_deliveries"("orderOutboxEventId", "webPushSubscriptionId");
CREATE INDEX "store_web_push_deliveries_status_available_idx"
  ON "store_web_push_deliveries"("status", "availableAt", "createdAt");
CREATE INDEX "store_web_push_deliveries_staff_version_idx"
  ON "store_web_push_deliveries"("storeStaffPushSubscriptionId", "aggregateVersion");
CREATE INDEX "store_web_push_deliveries_device_status_idx"
  ON "store_web_push_deliveries"("webPushSubscriptionId", "status");

CREATE INDEX "web_push_subscriptions_revoked_expiration_idx"
  ON "web_push_subscriptions"("revokedAt", "expirationTime");

ALTER TABLE "store_staff_push_subscriptions"
  ADD CONSTRAINT "store_staff_push_subscriptions_tenant_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "store_staff_push_subscriptions_store_fkey"
  FOREIGN KEY ("storeId", "tenantId") REFERENCES "stores"("id", "tenantId") ON DELETE CASCADE,
  ADD CONSTRAINT "store_staff_push_subscriptions_membership_fkey"
  FOREIGN KEY ("tenantId", "userId") REFERENCES "tenant_members"("tenantId", "userId") ON DELETE CASCADE,
  ADD CONSTRAINT "store_staff_push_subscriptions_subscription_fkey"
  FOREIGN KEY ("webPushSubscriptionId") REFERENCES "web_push_subscriptions"("id") ON DELETE CASCADE;

ALTER TABLE "store_web_push_dispatches"
  ADD CONSTRAINT "store_web_push_dispatches_tenant_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "store_web_push_dispatches_store_fkey"
  FOREIGN KEY ("storeId", "tenantId") REFERENCES "stores"("id", "tenantId") ON DELETE CASCADE,
  ADD CONSTRAINT "store_web_push_dispatches_order_fkey"
  FOREIGN KEY ("orderId", "tenantId", "storeId") REFERENCES "orders"("id", "tenantId", "storeId") ON DELETE CASCADE,
  ADD CONSTRAINT "store_web_push_dispatches_event_fkey"
  FOREIGN KEY ("orderOutboxEventId") REFERENCES "order_outbox_events"("id") ON DELETE CASCADE;

ALTER TABLE "store_web_push_deliveries"
  ADD CONSTRAINT "store_web_push_deliveries_tenant_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "store_web_push_deliveries_store_fkey"
  FOREIGN KEY ("storeId", "tenantId") REFERENCES "stores"("id", "tenantId") ON DELETE CASCADE,
  ADD CONSTRAINT "store_web_push_deliveries_order_fkey"
  FOREIGN KEY ("orderId", "tenantId", "storeId") REFERENCES "orders"("id", "tenantId", "storeId") ON DELETE CASCADE,
  ADD CONSTRAINT "store_web_push_deliveries_event_fkey"
  FOREIGN KEY ("orderOutboxEventId", "tenantId", "storeId") REFERENCES "order_outbox_events"("id", "tenantId", "storeId") ON DELETE CASCADE,
  ADD CONSTRAINT "store_web_push_deliveries_dispatch_fkey"
  FOREIGN KEY ("storeWebPushDispatchId", "tenantId", "storeId", "orderId") REFERENCES "store_web_push_dispatches"("id", "tenantId", "storeId", "orderId") ON DELETE CASCADE,
  ADD CONSTRAINT "store_web_push_deliveries_staff_subscription_fkey"
  FOREIGN KEY ("storeStaffPushSubscriptionId", "tenantId", "storeId") REFERENCES "store_staff_push_subscriptions"("id", "tenantId", "storeId") ON DELETE CASCADE,
  ADD CONSTRAINT "store_web_push_deliveries_subscription_fkey"
  FOREIGN KEY ("webPushSubscriptionId") REFERENCES "web_push_subscriptions"("id") ON DELETE CASCADE;

ALTER TABLE "store_staff_push_subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "store_web_push_dispatches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "store_web_push_deliveries" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "store_staff_push_subscriptions" FROM anon, authenticated;
REVOKE ALL ON TABLE "store_web_push_dispatches" FROM anon, authenticated;
REVOKE ALL ON TABLE "store_web_push_deliveries" FROM anon, authenticated;

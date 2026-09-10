CREATE TYPE "CustomerRelationshipSegment" AS ENUM (
  'NEW',
  'RETURNING',
  'RECURRING',
  'FREQUENT',
  'COOLING',
  'INACTIVE',
  'RECOVERED'
);

CREATE TYPE "CustomerReturnCampaignStatus" AS ENUM ('ACTIVE', 'ENDED', 'CANCELLED');
CREATE TYPE "CustomerReturnCampaignTarget" AS ENUM ('COOLING', 'INACTIVE', 'COOLING_AND_INACTIVE');
CREATE TYPE "CustomerReturnRecipientStatus" AS ENUM ('REWARDED', 'RETURNED', 'CONVERTED', 'EXPIRED');
CREATE TYPE "CustomerReturnNotificationStatus" AS ENUM (
  'NOT_REQUESTED',
  'PENDING',
  'SENT',
  'SKIPPED_NO_CONSENT',
  'SKIPPED_CHANNEL_UNAVAILABLE',
  'FAILED'
);

ALTER TABLE "store_entitlements"
  ADD COLUMN "customerRelationshipEnabled" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "customer_relationship_snapshots" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "consumerIdentityId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "firstCompletedOrderAt" TIMESTAMP(3) NOT NULL,
  "lastCompletedOrderAt" TIMESTAMP(3) NOT NULL,
  "completedOrderCount" INTEGER NOT NULL DEFAULT 0,
  "totalCompletedOrderValue" INTEGER NOT NULL DEFAULT 0,
  "averageOrderValue" INTEGER NOT NULL DEFAULT 0,
  "averageDaysBetweenOrders" DOUBLE PRECISION,
  "recentOrderFrequency" INTEGER NOT NULL DEFAULT 0,
  "segment" "CustomerRelationshipSegment" NOT NULL,
  "segmentUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "recoveredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "customer_relationship_snapshots_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "customer_relationship_metrics_check" CHECK (
    "completedOrderCount" > 0
    AND "totalCompletedOrderValue" >= 0
    AND "averageOrderValue" >= 0
    AND ("averageDaysBetweenOrders" IS NULL OR "averageDaysBetweenOrders" >= 0)
    AND "recentOrderFrequency" >= 0
  )
);

CREATE TABLE "customer_relationship_processed_orders" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "snapshotId" TEXT NOT NULL,
  "consumerIdentityId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "completedAt" TIMESTAMP(3) NOT NULL,
  "orderValue" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "customer_relationship_processed_orders_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "customer_relationship_order_value_check" CHECK ("orderValue" >= 0)
);

CREATE TABLE "consumer_communication_preferences" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "consumerIdentityId" TEXT NOT NULL,
  "benefitEarnedEnabled" BOOLEAN NOT NULL DEFAULT true,
  "benefitExpiringEnabled" BOOLEAN NOT NULL DEFAULT true,
  "storeOffersEnabled" BOOLEAN NOT NULL DEFAULT false,
  "storeOffersConsentedAt" TIMESTAMP(3),
  "storeOffersUnsubscribedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "consumer_communication_preferences_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "consumer_store_offer_consent_check" CHECK (
    ("storeOffersEnabled" = true AND "storeOffersConsentedAt" IS NOT NULL AND "storeOffersUnsubscribedAt" IS NULL)
    OR
    ("storeOffersEnabled" = false)
  )
);

CREATE TABLE "customer_return_campaigns" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "status" "CustomerReturnCampaignStatus" NOT NULL DEFAULT 'ACTIVE',
  "target" "CustomerReturnCampaignTarget" NOT NULL,
  "rewardType" "LoyaltyRewardType" NOT NULL,
  "rewardValue" INTEGER,
  "percentageBasisPoints" INTEGER,
  "maximumDiscountValue" INTEGER,
  "freeProductId" TEXT,
  "freeProductNameSnapshot" VARCHAR(160),
  "freeProductBaseValue" INTEGER,
  "minimumOrderValue" INTEGER NOT NULL DEFAULT 0,
  "validityDays" INTEGER NOT NULL DEFAULT 7,
  "cooldownDays" INTEGER NOT NULL DEFAULT 30,
  "audienceSize" INTEGER NOT NULL DEFAULT 0,
  "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "customer_return_campaigns_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "customer_return_campaign_window_check" CHECK ("endsAt" > "startsAt"),
  CONSTRAINT "customer_return_campaign_limits_check" CHECK (
    "minimumOrderValue" >= 0
    AND "validityDays" IN (7, 14, 30)
    AND "cooldownDays" = 30
    AND "audienceSize" >= 0
  ),
  CONSTRAINT "customer_return_campaign_reward_check" CHECK (
    (
      "rewardType" = 'FIXED_DISCOUNT'
      AND "rewardValue" > 0
      AND "percentageBasisPoints" IS NULL
      AND "maximumDiscountValue" IS NULL
      AND "freeProductId" IS NULL
      AND "freeProductNameSnapshot" IS NULL
      AND "freeProductBaseValue" IS NULL
    ) OR (
      "rewardType" = 'PERCENT_DISCOUNT'
      AND "rewardValue" IS NULL
      AND "percentageBasisPoints" BETWEEN 100 AND 5000
      AND ("maximumDiscountValue" IS NULL OR "maximumDiscountValue" > 0)
      AND "freeProductId" IS NULL
      AND "freeProductNameSnapshot" IS NULL
      AND "freeProductBaseValue" IS NULL
    ) OR (
      "rewardType" = 'FREE_PRODUCT'
      AND "rewardValue" IS NULL
      AND "percentageBasisPoints" IS NULL
      AND "maximumDiscountValue" IS NULL
      AND length("freeProductId") > 0
      AND length("freeProductNameSnapshot") > 0
      AND "freeProductBaseValue" > 0
    )
  )
);

CREATE TABLE "customer_return_campaign_recipients" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "snapshotId" TEXT NOT NULL,
  "consumerIdentityId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "rewardId" TEXT NOT NULL,
  "status" "CustomerReturnRecipientStatus" NOT NULL DEFAULT 'REWARDED',
  "marketingConsentAtActivation" BOOLEAN NOT NULL DEFAULT false,
  "notificationStatus" "CustomerReturnNotificationStatus" NOT NULL DEFAULT 'NOT_REQUESTED',
  "notifiedAt" TIMESTAMP(3),
  "firstReturnedAt" TIMESTAMP(3),
  "convertedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "customer_return_campaign_recipients_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "customer_return_recipient_notification_check" CHECK (
    ("notificationStatus" = 'SENT' AND "notifiedAt" IS NOT NULL)
    OR
    ("notificationStatus" <> 'SENT' AND "notifiedAt" IS NULL)
  )
);

CREATE TABLE "customer_return_campaign_orders" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "recipientId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "orderValue" INTEGER NOT NULL,
  "usedReward" BOOLEAN NOT NULL DEFAULT false,
  "completedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "customer_return_campaign_orders_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "customer_return_order_value_check" CHECK ("orderValue" >= 0)
);

CREATE UNIQUE INDEX "customer_relationship_snapshot_scope_key"
  ON "customer_relationship_snapshots"("id", "tenantId", "storeId");
CREATE UNIQUE INDEX "customer_relationship_identity_key"
  ON "customer_relationship_snapshots"("tenantId", "storeId", "consumerIdentityId");
CREATE UNIQUE INDEX "customer_relationship_customer_key"
  ON "customer_relationship_snapshots"("tenantId", "storeId", "customerId");
CREATE INDEX "customer_relationship_segment_idx"
  ON "customer_relationship_snapshots"("tenantId", "storeId", "segment", "lastCompletedOrderAt");
CREATE INDEX "customer_relationship_last_order_idx"
  ON "customer_relationship_snapshots"("tenantId", "storeId", "lastCompletedOrderAt");

CREATE UNIQUE INDEX "customer_relationship_order_scope_key"
  ON "customer_relationship_processed_orders"("orderId", "tenantId", "storeId");
CREATE INDEX "customer_relationship_order_identity_idx"
  ON "customer_relationship_processed_orders"("tenantId", "storeId", "consumerIdentityId", "completedAt");
CREATE INDEX "customer_relationship_order_snapshot_idx"
  ON "customer_relationship_processed_orders"("snapshotId", "completedAt");

CREATE UNIQUE INDEX "consumer_communication_preference_scope_key"
  ON "consumer_communication_preferences"("tenantId", "storeId", "consumerIdentityId");
CREATE INDEX "consumer_communication_preference_identity_idx"
  ON "consumer_communication_preferences"("consumerIdentityId", "storeId");

CREATE UNIQUE INDEX "customer_return_campaign_scope_key"
  ON "customer_return_campaigns"("id", "tenantId", "storeId");
CREATE INDEX "customer_return_campaign_status_idx"
  ON "customer_return_campaigns"("tenantId", "storeId", "status", "startsAt");
CREATE INDEX "customer_return_campaign_end_idx"
  ON "customer_return_campaigns"("tenantId", "storeId", "endsAt");
CREATE INDEX "customer_return_campaign_creator_idx"
  ON "customer_return_campaigns"("createdById", "createdAt");

CREATE UNIQUE INDEX "customer_return_recipient_scope_key"
  ON "customer_return_campaign_recipients"("id", "tenantId", "storeId");
CREATE UNIQUE INDEX "customer_return_recipient_campaign_identity_key"
  ON "customer_return_campaign_recipients"("campaignId", "consumerIdentityId");
CREATE UNIQUE INDEX "customer_return_recipient_reward_key"
  ON "customer_return_campaign_recipients"("rewardId");
CREATE UNIQUE INDEX "customer_return_recipient_reward_scope_key"
  ON "customer_return_campaign_recipients"("rewardId", "tenantId", "storeId");
CREATE INDEX "customer_return_recipient_status_idx"
  ON "customer_return_campaign_recipients"("campaignId", "status", "createdAt");
CREATE INDEX "customer_return_recipient_identity_idx"
  ON "customer_return_campaign_recipients"("tenantId", "storeId", "consumerIdentityId", "createdAt");
CREATE INDEX "customer_return_recipient_notification_idx"
  ON "customer_return_campaign_recipients"("tenantId", "storeId", "notificationStatus", "createdAt");

CREATE UNIQUE INDEX "customer_return_order_campaign_key"
  ON "customer_return_campaign_orders"("orderId", "campaignId");
CREATE INDEX "customer_return_order_campaign_idx"
  ON "customer_return_campaign_orders"("campaignId", "completedAt");
CREATE INDEX "customer_return_order_recipient_idx"
  ON "customer_return_campaign_orders"("recipientId", "completedAt");
CREATE INDEX "customer_return_order_scope_idx"
  ON "customer_return_campaign_orders"("tenantId", "storeId", "orderId");

ALTER TABLE "customer_relationship_snapshots"
  ADD CONSTRAINT "customer_relationship_snapshot_tenant_fk"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "customer_relationship_snapshot_store_fk"
    FOREIGN KEY ("storeId", "tenantId") REFERENCES "stores"("id", "tenantId") ON DELETE CASCADE,
  ADD CONSTRAINT "customer_relationship_snapshot_identity_fk"
    FOREIGN KEY ("consumerIdentityId") REFERENCES "consumer_identities"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "customer_relationship_snapshot_customer_fk"
    FOREIGN KEY ("customerId", "tenantId") REFERENCES "customers"("id", "tenantId") ON DELETE RESTRICT;

ALTER TABLE "customer_relationship_processed_orders"
  ADD CONSTRAINT "customer_relationship_order_tenant_fk"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "customer_relationship_order_store_fk"
    FOREIGN KEY ("storeId", "tenantId") REFERENCES "stores"("id", "tenantId") ON DELETE CASCADE,
  ADD CONSTRAINT "customer_relationship_order_snapshot_fk"
    FOREIGN KEY ("snapshotId", "tenantId", "storeId") REFERENCES "customer_relationship_snapshots"("id", "tenantId", "storeId") ON DELETE CASCADE,
  ADD CONSTRAINT "customer_relationship_order_identity_fk"
    FOREIGN KEY ("consumerIdentityId") REFERENCES "consumer_identities"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "customer_relationship_order_order_fk"
    FOREIGN KEY ("orderId", "tenantId", "storeId") REFERENCES "orders"("id", "tenantId", "storeId") ON DELETE RESTRICT;

ALTER TABLE "consumer_communication_preferences"
  ADD CONSTRAINT "consumer_communication_preference_tenant_fk"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "consumer_communication_preference_store_fk"
    FOREIGN KEY ("storeId", "tenantId") REFERENCES "stores"("id", "tenantId") ON DELETE CASCADE,
  ADD CONSTRAINT "consumer_communication_preference_identity_fk"
    FOREIGN KEY ("consumerIdentityId") REFERENCES "consumer_identities"("id") ON DELETE CASCADE;

ALTER TABLE "customer_return_campaigns"
  ADD CONSTRAINT "customer_return_campaign_tenant_fk"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "customer_return_campaign_store_fk"
    FOREIGN KEY ("storeId", "tenantId") REFERENCES "stores"("id", "tenantId") ON DELETE CASCADE,
  ADD CONSTRAINT "customer_return_campaign_creator_fk"
    FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT;

ALTER TABLE "customer_return_campaign_recipients"
  ADD CONSTRAINT "customer_return_recipient_tenant_fk"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "customer_return_recipient_store_fk"
    FOREIGN KEY ("storeId", "tenantId") REFERENCES "stores"("id", "tenantId") ON DELETE CASCADE,
  ADD CONSTRAINT "customer_return_recipient_campaign_fk"
    FOREIGN KEY ("campaignId", "tenantId", "storeId") REFERENCES "customer_return_campaigns"("id", "tenantId", "storeId") ON DELETE CASCADE,
  ADD CONSTRAINT "customer_return_recipient_snapshot_fk"
    FOREIGN KEY ("snapshotId", "tenantId", "storeId") REFERENCES "customer_relationship_snapshots"("id", "tenantId", "storeId") ON DELETE RESTRICT,
  ADD CONSTRAINT "customer_return_recipient_identity_fk"
    FOREIGN KEY ("consumerIdentityId") REFERENCES "consumer_identities"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "customer_return_recipient_customer_fk"
    FOREIGN KEY ("customerId", "tenantId") REFERENCES "customers"("id", "tenantId") ON DELETE RESTRICT,
  ADD CONSTRAINT "customer_return_recipient_reward_fk"
    FOREIGN KEY ("rewardId", "tenantId", "storeId") REFERENCES "loyalty_rewards"("id", "tenantId", "storeId") ON DELETE RESTRICT;

ALTER TABLE "customer_return_campaign_orders"
  ADD CONSTRAINT "customer_return_order_tenant_fk"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "customer_return_order_store_fk"
    FOREIGN KEY ("storeId", "tenantId") REFERENCES "stores"("id", "tenantId") ON DELETE CASCADE,
  ADD CONSTRAINT "customer_return_order_campaign_fk"
    FOREIGN KEY ("campaignId", "tenantId", "storeId") REFERENCES "customer_return_campaigns"("id", "tenantId", "storeId") ON DELETE CASCADE,
  ADD CONSTRAINT "customer_return_order_recipient_fk"
    FOREIGN KEY ("recipientId", "tenantId", "storeId") REFERENCES "customer_return_campaign_recipients"("id", "tenantId", "storeId") ON DELETE CASCADE,
  ADD CONSTRAINT "customer_return_order_order_fk"
    FOREIGN KEY ("orderId", "tenantId", "storeId") REFERENCES "orders"("id", "tenantId", "storeId") ON DELETE RESTRICT;

ALTER TABLE "customer_relationship_snapshots" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "customer_relationship_processed_orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "consumer_communication_preferences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "customer_return_campaigns" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "customer_return_campaign_recipients" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "customer_return_campaign_orders" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  "customer_relationship_snapshots",
  "customer_relationship_processed_orders",
  "consumer_communication_preferences",
  "customer_return_campaigns",
  "customer_return_campaign_recipients",
  "customer_return_campaign_orders"
FROM PUBLIC, anon, authenticated;

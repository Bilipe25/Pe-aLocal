CREATE TYPE "LoyaltyCycleStatus" AS ENUM ('ACTIVE', 'COMPLETED');
CREATE TYPE "LoyaltyRewardStatus" AS ENUM ('AVAILABLE', 'RESERVED', 'REDEEMED', 'CANCELLED');
ALTER TYPE "OrderPriceAdjustmentType" ADD VALUE 'LOYALTY';

ALTER TABLE "store_entitlements" ADD COLUMN "loyaltyEnabled" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "loyalty_programs" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "requiredOrders" INTEGER NOT NULL,
  "rewardValue" INTEGER NOT NULL,
  "minimumOrderValue" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT false,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "loyalty_programs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "loyalty_program_required_orders_check" CHECK ("requiredOrders" BETWEEN 2 AND 20),
  CONSTRAINT "loyalty_program_reward_value_check" CHECK ("rewardValue" > 0),
  CONSTRAINT "loyalty_program_minimum_order_check" CHECK ("minimumOrderValue" >= 0)
);

CREATE TABLE "loyalty_cycles" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "consumerIdentityId" TEXT NOT NULL,
  "programId" TEXT NOT NULL,
  "programVersion" INTEGER NOT NULL,
  "requiredOrders" INTEGER NOT NULL,
  "rewardValue" INTEGER NOT NULL,
  "minimumOrderValue" INTEGER NOT NULL,
  "progress" INTEGER NOT NULL DEFAULT 0,
  "status" "LoyaltyCycleStatus" NOT NULL DEFAULT 'ACTIVE',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "loyalty_cycles_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "loyalty_cycle_progress_check" CHECK ("progress" >= 0 AND "progress" <= "requiredOrders")
);

CREATE TABLE "loyalty_contributions" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "consumerIdentityId" TEXT NOT NULL,
  "cycleId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "loyalty_contributions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "loyalty_rewards" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "consumerIdentityId" TEXT NOT NULL,
  "cycleId" TEXT NOT NULL,
  "value" INTEGER NOT NULL,
  "minimumOrderValue" INTEGER NOT NULL,
  "status" "LoyaltyRewardStatus" NOT NULL DEFAULT 'AVAILABLE',
  "orderId" TEXT,
  "reservedAt" TIMESTAMP(3),
  "redeemedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "loyalty_rewards_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "loyalty_reward_value_check" CHECK ("value" > 0),
  CONSTRAINT "loyalty_reward_minimum_order_check" CHECK ("minimumOrderValue" >= 0)
);

CREATE UNIQUE INDEX "loyalty_programs_id_tenantId_storeId_key" ON "loyalty_programs"("id", "tenantId", "storeId");
CREATE UNIQUE INDEX "loyalty_programs_storeId_version_key" ON "loyalty_programs"("storeId", "version");
CREATE UNIQUE INDEX "loyalty_programs_one_active_per_store" ON "loyalty_programs"("storeId") WHERE "isActive" = true;
CREATE INDEX "loyalty_programs_tenantId_storeId_isActive_version_idx" ON "loyalty_programs"("tenantId", "storeId", "isActive", "version");
CREATE INDEX "loyalty_programs_createdById_idx" ON "loyalty_programs"("createdById");

CREATE UNIQUE INDEX "loyalty_cycles_id_tenantId_storeId_key" ON "loyalty_cycles"("id", "tenantId", "storeId");
CREATE UNIQUE INDEX "loyalty_cycles_one_active_per_consumer" ON "loyalty_cycles"("storeId", "consumerIdentityId") WHERE "status" = 'ACTIVE';
CREATE INDEX "loyalty_cycles_tenant_store_consumer_status_idx" ON "loyalty_cycles"("tenantId", "storeId", "consumerIdentityId", "status", "startedAt");

CREATE UNIQUE INDEX "loyalty_contributions_order_tenant_store_key" ON "loyalty_contributions"("orderId", "tenantId", "storeId");
CREATE UNIQUE INDEX "loyalty_contributions_id_tenantId_storeId_key" ON "loyalty_contributions"("id", "tenantId", "storeId");
CREATE INDEX "loyalty_contributions_store_consumer_created_idx" ON "loyalty_contributions"("tenantId", "storeId", "consumerIdentityId", "createdAt");

CREATE UNIQUE INDEX "loyalty_rewards_cycle_tenant_store_key" ON "loyalty_rewards"("cycleId", "tenantId", "storeId");
CREATE UNIQUE INDEX "loyalty_rewards_order_tenant_store_key" ON "loyalty_rewards"("orderId", "tenantId", "storeId");
CREATE UNIQUE INDEX "loyalty_rewards_id_tenantId_storeId_key" ON "loyalty_rewards"("id", "tenantId", "storeId");
CREATE INDEX "loyalty_rewards_store_consumer_status_idx" ON "loyalty_rewards"("tenantId", "storeId", "consumerIdentityId", "status", "createdAt");
CREATE INDEX "loyalty_rewards_store_status_idx" ON "loyalty_rewards"("tenantId", "storeId", "status", "createdAt");

ALTER TABLE "loyalty_programs" ADD CONSTRAINT "loyalty_programs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "loyalty_programs" ADD CONSTRAINT "loyalty_programs_storeId_tenantId_fkey" FOREIGN KEY ("storeId", "tenantId") REFERENCES "stores"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "loyalty_programs" ADD CONSTRAINT "loyalty_programs_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "loyalty_cycles" ADD CONSTRAINT "loyalty_cycles_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "loyalty_cycles" ADD CONSTRAINT "loyalty_cycles_storeId_tenantId_fkey" FOREIGN KEY ("storeId", "tenantId") REFERENCES "stores"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "loyalty_cycles" ADD CONSTRAINT "loyalty_cycles_consumerIdentityId_fkey" FOREIGN KEY ("consumerIdentityId") REFERENCES "consumer_identities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "loyalty_cycles" ADD CONSTRAINT "loyalty_cycles_programId_tenantId_storeId_fkey" FOREIGN KEY ("programId", "tenantId", "storeId") REFERENCES "loyalty_programs"("id", "tenantId", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "loyalty_contributions" ADD CONSTRAINT "loyalty_contributions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "loyalty_contributions" ADD CONSTRAINT "loyalty_contributions_storeId_tenantId_fkey" FOREIGN KEY ("storeId", "tenantId") REFERENCES "stores"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "loyalty_contributions" ADD CONSTRAINT "loyalty_contributions_consumerIdentityId_fkey" FOREIGN KEY ("consumerIdentityId") REFERENCES "consumer_identities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "loyalty_contributions" ADD CONSTRAINT "loyalty_contributions_cycleId_tenantId_storeId_fkey" FOREIGN KEY ("cycleId", "tenantId", "storeId") REFERENCES "loyalty_cycles"("id", "tenantId", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "loyalty_contributions" ADD CONSTRAINT "loyalty_contributions_orderId_tenantId_storeId_fkey" FOREIGN KEY ("orderId", "tenantId", "storeId") REFERENCES "orders"("id", "tenantId", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "loyalty_rewards" ADD CONSTRAINT "loyalty_rewards_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "loyalty_rewards" ADD CONSTRAINT "loyalty_rewards_storeId_tenantId_fkey" FOREIGN KEY ("storeId", "tenantId") REFERENCES "stores"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "loyalty_rewards" ADD CONSTRAINT "loyalty_rewards_consumerIdentityId_fkey" FOREIGN KEY ("consumerIdentityId") REFERENCES "consumer_identities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "loyalty_rewards" ADD CONSTRAINT "loyalty_rewards_cycleId_tenantId_storeId_fkey" FOREIGN KEY ("cycleId", "tenantId", "storeId") REFERENCES "loyalty_cycles"("id", "tenantId", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "loyalty_rewards" ADD CONSTRAINT "loyalty_rewards_orderId_tenantId_storeId_fkey" FOREIGN KEY ("orderId", "tenantId", "storeId") REFERENCES "orders"("id", "tenantId", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "loyalty_programs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "loyalty_cycles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "loyalty_contributions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "loyalty_rewards" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "loyalty_programs", "loyalty_cycles", "loyalty_contributions", "loyalty_rewards" FROM PUBLIC, anon, authenticated;

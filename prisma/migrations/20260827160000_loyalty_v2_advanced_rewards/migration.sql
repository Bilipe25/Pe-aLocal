CREATE TYPE "LoyaltyRewardType" AS ENUM ('FIXED_DISCOUNT', 'PERCENT_DISCOUNT', 'FREE_PRODUCT');

ALTER TYPE "LoyaltyRewardStatus" ADD VALUE 'EXPIRED';
ALTER TYPE "OperationalOutboxEventType" ADD VALUE 'LOYALTY_REWARD_EARNED';
ALTER TYPE "OperationalOutboxEventType" ADD VALUE 'LOYALTY_REWARD_EXPIRING';
ALTER TYPE "OperationalOutboxEventType" ADD VALUE 'LOYALTY_REWARD_REDEEMED';

ALTER TABLE "store_entitlements"
  ADD COLUMN "loyaltyAdvancedRewardsEnabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "loyalty_programs"
  ADD COLUMN "rewardType" "LoyaltyRewardType" NOT NULL DEFAULT 'FIXED_DISCOUNT',
  ADD COLUMN "percentageBasisPoints" INTEGER,
  ADD COLUMN "maximumDiscountValue" INTEGER,
  ADD COLUMN "freeProductId" TEXT,
  ADD COLUMN "freeProductNameSnapshot" VARCHAR(160),
  ADD COLUMN "freeProductBaseValue" INTEGER,
  ADD COLUMN "validityDays" INTEGER,
  ALTER COLUMN "rewardValue" DROP NOT NULL;

ALTER TABLE "loyalty_cycles"
  ADD COLUMN "rewardType" "LoyaltyRewardType" NOT NULL DEFAULT 'FIXED_DISCOUNT',
  ADD COLUMN "percentageBasisPoints" INTEGER,
  ADD COLUMN "maximumDiscountValue" INTEGER,
  ADD COLUMN "freeProductId" TEXT,
  ADD COLUMN "freeProductNameSnapshot" VARCHAR(160),
  ADD COLUMN "freeProductBaseValue" INTEGER,
  ADD COLUMN "validityDays" INTEGER,
  ALTER COLUMN "rewardValue" DROP NOT NULL;

ALTER TABLE "loyalty_rewards"
  ADD COLUMN "rewardType" "LoyaltyRewardType" NOT NULL DEFAULT 'FIXED_DISCOUNT',
  ADD COLUMN "percentageBasisPoints" INTEGER,
  ADD COLUMN "maximumDiscountValue" INTEGER,
  ADD COLUMN "freeProductId" TEXT,
  ADD COLUMN "freeProductNameSnapshot" VARCHAR(160),
  ADD COLUMN "freeProductBaseValue" INTEGER,
  ADD COLUMN "expiresAt" TIMESTAMP(3),
  ADD COLUMN "expiredAt" TIMESTAMP(3),
  ALTER COLUMN "value" DROP NOT NULL;

ALTER TABLE "loyalty_programs"
  DROP CONSTRAINT "loyalty_program_reward_value_check",
  ADD CONSTRAINT "loyalty_program_validity_days_check"
    CHECK ("validityDays" IS NULL OR "validityDays" IN (30, 60, 90)),
  ADD CONSTRAINT "loyalty_program_reward_configuration_check" CHECK (
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
  );

ALTER TABLE "loyalty_cycles"
  ADD CONSTRAINT "loyalty_cycle_validity_days_check"
    CHECK ("validityDays" IS NULL OR "validityDays" IN (30, 60, 90)),
  ADD CONSTRAINT "loyalty_cycle_reward_configuration_check" CHECK (
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
  );

ALTER TABLE "loyalty_rewards"
  DROP CONSTRAINT "loyalty_reward_value_check",
  ADD CONSTRAINT "loyalty_reward_expiry_state_check"
    CHECK (("status" = 'EXPIRED') = ("expiredAt" IS NOT NULL)),
  ADD CONSTRAINT "loyalty_reward_reward_configuration_check" CHECK (
    (
      "rewardType" = 'FIXED_DISCOUNT'
      AND "value" > 0
      AND "percentageBasisPoints" IS NULL
      AND "maximumDiscountValue" IS NULL
      AND "freeProductId" IS NULL
      AND "freeProductNameSnapshot" IS NULL
      AND "freeProductBaseValue" IS NULL
    ) OR (
      "rewardType" = 'PERCENT_DISCOUNT'
      AND "value" IS NULL
      AND "percentageBasisPoints" BETWEEN 100 AND 5000
      AND ("maximumDiscountValue" IS NULL OR "maximumDiscountValue" > 0)
      AND "freeProductId" IS NULL
      AND "freeProductNameSnapshot" IS NULL
      AND "freeProductBaseValue" IS NULL
    ) OR (
      "rewardType" = 'FREE_PRODUCT'
      AND "value" IS NULL
      AND "percentageBasisPoints" IS NULL
      AND "maximumDiscountValue" IS NULL
      AND length("freeProductId") > 0
      AND length("freeProductNameSnapshot") > 0
      AND "freeProductBaseValue" > 0
    )
  );

DROP INDEX "loyalty_rewards_store_consumer_status_idx";
CREATE INDEX "loyalty_rewards_consumer_status_expiry_idx"
  ON "loyalty_rewards"("tenantId", "storeId", "consumerIdentityId", "status", "expiresAt", "createdAt");

CREATE INDEX "loyalty_rewards_available_expiry_idx"
  ON "loyalty_rewards"("expiresAt", "tenantId", "storeId")
  WHERE "status" = 'AVAILABLE' AND "expiresAt" IS NOT NULL;

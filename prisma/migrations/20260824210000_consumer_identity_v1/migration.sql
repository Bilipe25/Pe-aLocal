-- Consumer Identity + Clientes V1. Additive foundation; no legacy customer is linked.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.orders order_row
    JOIN public.customers customer ON customer.id = order_row."customerId"
    WHERE order_row."customerId" IS NOT NULL
      AND customer."tenantId" <> order_row."tenantId"
  ) THEN
    RAISE EXCEPTION 'Consumer identity migration blocked: Order/Customer tenant mismatch'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.checkout_recognition_sessions recognition
    JOIN public.customers customer ON customer.id = recognition."customerId"
    WHERE recognition."customerId" IS NOT NULL
      AND customer."tenantId" <> recognition."tenantId"
  ) THEN
    RAISE EXCEPTION 'Consumer identity migration blocked: recognition/Customer tenant mismatch'
      USING ERRCODE = '23514';
  END IF;
END $$;

CREATE TYPE "ConsumerIdentityLinkProof" AS ENUM ('ORDER_PUBLIC_TOKEN', 'DEVICE_RECOGNITION');
CREATE TYPE "ConsumerVerificationPurpose" AS ENUM ('LOGIN', 'ORDER_CLAIM', 'DEVICE_CLAIM');
CREATE TYPE "ConsumerVerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'FAILED', 'EXPIRED', 'CANCELLED');

ALTER TABLE "store_entitlements"
  ADD COLUMN "consumerIdentityEnabled" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "consumer_identities" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "phoneNormalized" VARCHAR(13) NOT NULL,
  "phoneVerifiedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "consumer_identities_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "consumer_identities_phoneNormalized_key" UNIQUE ("phoneNormalized"),
  CONSTRAINT "consumer_identities_phone_format_check" CHECK ("phoneNormalized" ~ '^55[0-9]{10,11}$')
);

CREATE TABLE "consumer_sessions" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "consumerIdentityId" TEXT NOT NULL,
  "tokenHash" CHAR(64) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "consumer_sessions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "consumer_sessions_tokenHash_key" UNIQUE ("tokenHash"),
  CONSTRAINT "consumer_sessions_expiration_check" CHECK ("expiresAt" > "createdAt")
);

ALTER TABLE "customers"
  ADD COLUMN "consumerIdentityId" TEXT,
  ADD COLUMN "consumerIdentityLinkedAt" TIMESTAMP(3),
  ADD COLUMN "consumerIdentityLinkProof" "ConsumerIdentityLinkProof",
  ADD CONSTRAINT "customers_consumer_link_shape_check" CHECK (
    ("consumerIdentityId" IS NULL AND "consumerIdentityLinkedAt" IS NULL AND "consumerIdentityLinkProof" IS NULL)
    OR
    ("consumerIdentityId" IS NOT NULL AND "consumerIdentityLinkedAt" IS NOT NULL AND "consumerIdentityLinkProof" IS NOT NULL)
  );

CREATE TABLE "consumer_verification_challenges" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "challengeTokenHash" CHAR(64) NOT NULL,
  "tenantId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "phoneNormalized" VARCHAR(13) NOT NULL,
  "purpose" "ConsumerVerificationPurpose" NOT NULL,
  "status" "ConsumerVerificationStatus" NOT NULL DEFAULT 'PENDING',
  "provider" VARCHAR(24) NOT NULL,
  "consumerIdentityId" TEXT,
  "claimCustomerId" TEXT,
  "claimOrderId" TEXT,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "resendCount" INTEGER NOT NULL DEFAULT 0,
  "resendAfter" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "verifiedAt" TIMESTAMP(3),
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "consumer_verification_challenges_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "consumer_verification_challenges_token_key" UNIQUE ("challengeTokenHash"),
  CONSTRAINT "consumer_verification_challenges_phone_check" CHECK ("phoneNormalized" ~ '^55[0-9]{10,11}$'),
  CONSTRAINT "consumer_verification_challenges_attempt_check" CHECK ("attemptCount" BETWEEN 0 AND 5),
  CONSTRAINT "consumer_verification_challenges_resend_check" CHECK ("resendCount" >= 0),
  CONSTRAINT "consumer_verification_challenges_expiration_check" CHECK ("expiresAt" > "createdAt"),
  CONSTRAINT "consumer_verification_challenges_claim_shape_check" CHECK (
    ("purpose" = 'LOGIN' AND "claimCustomerId" IS NULL AND "claimOrderId" IS NULL)
    OR ("purpose" = 'ORDER_CLAIM' AND "claimCustomerId" IS NOT NULL AND "claimOrderId" IS NOT NULL)
    OR ("purpose" = 'DEVICE_CLAIM' AND "claimCustomerId" IS NOT NULL AND "claimOrderId" IS NULL)
  )
);

CREATE UNIQUE INDEX "customers_tenantId_consumerIdentityId_key"
  ON "customers"("tenantId", "consumerIdentityId");
CREATE INDEX "customers_consumerIdentityId_idx" ON "customers"("consumerIdentityId");
CREATE INDEX "consumer_identities_phoneVerifiedAt_idx" ON "consumer_identities"("phoneVerifiedAt");
CREATE INDEX "consumer_sessions_identity_active_idx"
  ON "consumer_sessions"("consumerIdentityId", "revokedAt", "expiresAt");
CREATE INDEX "consumer_sessions_expiresAt_idx" ON "consumer_sessions"("expiresAt");
CREATE INDEX "consumer_verification_challenges_scope_phone_idx"
  ON "consumer_verification_challenges"("tenantId", "storeId", "phoneNormalized", "createdAt");
CREATE INDEX "consumer_verification_challenges_customer_expiry_idx"
  ON "consumer_verification_challenges"("claimCustomerId", "expiresAt");
CREATE INDEX "consumer_verification_challenges_expiry_status_idx"
  ON "consumer_verification_challenges"("expiresAt", "status");
CREATE INDEX "orders_consumer_history_idx"
  ON "orders"("tenantId", "storeId", "customerId", "createdAt", "id");

ALTER TABLE "consumer_sessions"
  ADD CONSTRAINT "consumer_sessions_identity_fkey"
    FOREIGN KEY ("consumerIdentityId") REFERENCES "consumer_identities"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "customers"
  ADD CONSTRAINT "customers_consumerIdentityId_fkey"
    FOREIGN KEY ("consumerIdentityId") REFERENCES "consumer_identities"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "consumer_verification_challenges"
  ADD CONSTRAINT "consumer_verification_challenges_tenant_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "consumer_verification_challenges_store_scope_fkey"
    FOREIGN KEY ("storeId", "tenantId") REFERENCES "stores"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "consumer_verification_challenges_identity_fkey"
    FOREIGN KEY ("consumerIdentityId") REFERENCES "consumer_identities"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "consumer_verification_challenges_customer_scope_fkey"
    FOREIGN KEY ("claimCustomerId", "tenantId") REFERENCES "customers"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "consumer_verification_challenges_order_scope_fkey"
    FOREIGN KEY ("claimOrderId", "tenantId", "storeId") REFERENCES "orders"("id", "tenantId", "storeId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "orders"
  ADD CONSTRAINT "orders_customerId_tenantId_fkey"
    FOREIGN KEY ("customerId", "tenantId") REFERENCES "customers"("id", "tenantId")
    ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
ALTER TABLE "checkout_recognition_sessions"
  ADD CONSTRAINT "checkout_recognition_sessions_customerId_tenantId_fkey"
    FOREIGN KEY ("customerId", "tenantId") REFERENCES "customers"("id", "tenantId")
    ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;

ALTER TABLE "orders" VALIDATE CONSTRAINT "orders_customerId_tenantId_fkey";
ALTER TABLE "checkout_recognition_sessions"
  VALIDATE CONSTRAINT "checkout_recognition_sessions_customerId_tenantId_fkey";

ALTER TABLE "orders" DROP CONSTRAINT "orders_customerId_fkey";
ALTER TABLE "checkout_recognition_sessions"
  DROP CONSTRAINT "checkout_recognition_sessions_customerId_fkey";

ALTER TABLE "consumer_identities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "consumer_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "consumer_verification_challenges" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "consumer_identities" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE "consumer_sessions" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE "consumer_verification_challenges" FROM PUBLIC, anon, authenticated;

COMMIT;

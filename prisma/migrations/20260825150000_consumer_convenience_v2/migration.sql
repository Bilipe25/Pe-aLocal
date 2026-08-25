-- Identidade Progressiva V2 + Clientes V2 (expand-only).
-- Esta migration não faz backfill e não remove dados da V1.

ALTER TYPE "ConsumerVerificationPurpose" ADD VALUE IF NOT EXISTS 'EMAIL_CHANGE_CURRENT';
ALTER TYPE "ConsumerVerificationPurpose" ADD VALUE IF NOT EXISTS 'EMAIL_CHANGE_NEW';

CREATE TYPE "ConsumerEmailChangeStatus" AS ENUM (
  'PENDING',
  'CURRENT_VERIFIED',
  'COMPLETED',
  'FAILED',
  'EXPIRED',
  'CANCELLED'
);

ALTER TABLE "store_entitlements"
  ADD COLUMN "consumerConvenienceV2Enabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "consumer_sessions"
  ADD COLUMN "deviceLabel" VARCHAR(80);

ALTER TABLE "consumer_verification_challenges"
  ADD COLUMN "emailChangeRequestId" TEXT,
  ADD COLUMN "requestIpHash" CHAR(64);

CREATE TABLE "consumer_favorites" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "consumerIdentityId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "consumer_favorites_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "consumer_favorites_identity_store_product_key"
    UNIQUE ("consumerIdentityId", "tenantId", "storeId", "productId")
);

CREATE TABLE "consumer_email_change_requests" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "consumerIdentityId" TEXT NOT NULL,
  "initiatedBySessionId" TEXT,
  "currentEmailHash" CHAR(64) NOT NULL,
  "newEmailNormalized" VARCHAR(254) NOT NULL,
  "status" "ConsumerEmailChangeStatus" NOT NULL DEFAULT 'PENDING',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "currentVerifiedAt" TIMESTAMP(3),
  "newVerifiedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "consumer_email_change_requests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "consumer_email_change_expiration_check" CHECK ("expiresAt" > "createdAt")
);

ALTER TABLE "consumer_favorites"
  ADD CONSTRAINT "consumer_favorites_identity_fkey"
    FOREIGN KEY ("consumerIdentityId") REFERENCES "consumer_identities"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "consumer_favorites_tenant_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "consumer_favorites_store_fkey"
    FOREIGN KEY ("storeId", "tenantId") REFERENCES "stores"("id", "tenantId")
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "consumer_favorites_product_fkey"
    FOREIGN KEY ("productId", "tenantId", "storeId") REFERENCES "products"("id", "tenantId", "storeId")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "consumer_email_change_requests"
  ADD CONSTRAINT "consumer_email_change_identity_fkey"
    FOREIGN KEY ("consumerIdentityId") REFERENCES "consumer_identities"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "consumer_email_change_session_fkey"
    FOREIGN KEY ("initiatedBySessionId") REFERENCES "consumer_sessions"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "consumer_verification_challenges"
  ADD CONSTRAINT "consumer_verification_email_change_fkey"
    FOREIGN KEY ("emailChangeRequestId") REFERENCES "consumer_email_change_requests"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "consumer_verification_request_ip_hash_check"
    CHECK ("requestIpHash" IS NULL OR "requestIpHash" ~ '^[a-f0-9]{64}$');

ALTER TABLE "consumer_favorites" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "consumer_email_change_requests" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "consumer_favorites" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE "consumer_email_change_requests" FROM PUBLIC, anon, authenticated;

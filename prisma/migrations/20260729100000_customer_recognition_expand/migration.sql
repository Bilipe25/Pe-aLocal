-- Customer recognition v1: additive foundation.
-- Recognition is deliberately not authentication and must never authorize
-- access to unmasked customer data.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

CREATE TYPE "CustomerAddressLabel" AS ENUM ('HOME', 'WORK', 'OTHER');
CREATE TYPE "CustomerRecognitionThrottleScope" AS ENUM ('IP', 'PHONE', 'STORE', 'SESSION');
CREATE TYPE "CheckoutRecognitionConfirmationMode" AS ENUM ('SAVED_ADDRESS', 'NEW_ADDRESS');

ALTER TABLE "customers"
  ADD COLUMN "phoneNormalized" VARCHAR(13),
  ADD COLUMN "lastOrderAt" TIMESTAMP(3),
  ADD COLUMN "recognitionEnabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "customer_addresses"
  ADD COLUMN "tenantId" TEXT,
  ADD COLUMN "label" "CustomerAddressLabel" NOT NULL DEFAULT 'OTHER',
  ADD COLUMN "addressFingerprint" CHAR(64),
  ADD COLUMN "lastUsedAt" TIMESTAMP(3),
  ADD COLUMN "updatedAt" TIMESTAMP(3);

ALTER TABLE "customers"
  ADD CONSTRAINT "customers_phone_normalized_required_check"
    CHECK ("phoneNormalized" IS NOT NULL) NOT VALID,
  ADD CONSTRAINT "customers_phone_normalized_format_check"
    CHECK (
      "phoneNormalized" IS NULL
      OR "phoneNormalized" ~ '^55[1-9]{2}[2-9][0-9]{7,8}$'
    ) NOT VALID;

ALTER TABLE "customer_addresses"
  ADD CONSTRAINT "customer_addresses_recognition_fields_required_check"
    CHECK (
      "tenantId" IS NOT NULL
      AND "addressFingerprint" IS NOT NULL
      AND "updatedAt" IS NOT NULL
    ) NOT VALID,
  ADD CONSTRAINT "customer_addresses_fingerprint_format_check"
    CHECK (
      "addressFingerprint" IS NULL
      OR "addressFingerprint" ~ '^[0-9a-f]{64}$'
    ) NOT VALID;

CREATE TABLE "customer_address_store_uses" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "customerAddressId" TEXT NOT NULL,
  "deliveryZoneId" TEXT NOT NULL,
  "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "customer_address_store_uses_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "checkout_recognition_sessions" (
  "id" TEXT NOT NULL,
  "tokenHash" CHAR(64) NOT NULL,
  "tenantId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "customerId" TEXT,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3),
  "blockedUntil" TIMESTAMP(3),
  "confirmedAt" TIMESTAMP(3),
  "confirmationMode" "CheckoutRecognitionConfirmationMode",
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "invalidatedAt" TIMESTAMP(3),
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "checkout_recognition_sessions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "checkout_recognition_sessions_token_hash_check"
    CHECK ("tokenHash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "checkout_recognition_sessions_attempts_check"
    CHECK ("attemptCount" >= 0 AND "consecutiveFailures" >= 0),
  CONSTRAINT "checkout_recognition_sessions_confirmation_check"
    CHECK (
      ("confirmedAt" IS NULL AND "confirmationMode" IS NULL)
      OR ("confirmedAt" IS NOT NULL AND "confirmationMode" IS NOT NULL)
    ),
  CONSTRAINT "checkout_recognition_sessions_expiry_check"
    CHECK ("expiresAt" > "createdAt")
);

CREATE TABLE "checkout_recognition_address_references" (
  "id" TEXT NOT NULL,
  "referenceHash" CHAR(64) NOT NULL,
  "recognitionSessionId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "customerAddressId" TEXT NOT NULL,
  "addressUpdatedAt" TIMESTAMP(3) NOT NULL,
  "confirmedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "invalidatedAt" TIMESTAMP(3),
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "checkout_recognition_address_references_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "checkout_recognition_address_references_hash_check"
    CHECK ("referenceHash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "checkout_recognition_address_references_expiry_check"
    CHECK ("expiresAt" > "createdAt")
);

CREATE TABLE "customer_recognition_throttles" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "storeId" TEXT,
  "scope" "CustomerRecognitionThrottleScope" NOT NULL,
  "keyHash" CHAR(64) NOT NULL,
  "failureCount" INTEGER NOT NULL DEFAULT 0,
  "windowStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "nextAttemptAt" TIMESTAMP(3),
  "blockedUntil" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "customer_recognition_throttles_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "customer_recognition_throttles_key_hash_check"
    CHECK ("keyHash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "customer_recognition_throttles_failures_check"
    CHECK ("failureCount" >= 0),
  CONSTRAINT "customer_recognition_throttles_scope_check"
    CHECK (
      ("scope" IN ('IP', 'PHONE') AND "storeId" IS NULL)
      OR ("scope" IN ('STORE', 'SESSION') AND "storeId" IS NOT NULL)
    ),
  CONSTRAINT "customer_recognition_throttles_expiry_check"
    CHECK ("expiresAt" > "windowStartedAt")
);

CREATE UNIQUE INDEX "customer_address_store_uses_customerAddressId_storeId_key"
  ON "customer_address_store_uses"("customerAddressId", "storeId");
CREATE INDEX "customer_address_store_uses_tenantId_storeId_lastUsedAt_idx"
  ON "customer_address_store_uses"("tenantId", "storeId", "lastUsedAt");
CREATE INDEX "customer_address_store_uses_deliveryZoneId_tenantId_storeId_idx"
  ON "customer_address_store_uses"("deliveryZoneId", "tenantId", "storeId");

CREATE UNIQUE INDEX "checkout_recognition_sessions_tokenHash_key"
  ON "checkout_recognition_sessions"("tokenHash");
CREATE INDEX "checkout_recognition_sessions_tenantId_storeId_expiresAt_idx"
  ON "checkout_recognition_sessions"("tenantId", "storeId", "expiresAt");
CREATE INDEX "checkout_recognition_sessions_customerId_expiresAt_idx"
  ON "checkout_recognition_sessions"("customerId", "expiresAt");
CREATE INDEX "checkout_recognition_sessions_expiresAt_idx"
  ON "checkout_recognition_sessions"("expiresAt");

CREATE UNIQUE INDEX "checkout_recognition_address_references_referenceHash_key"
  ON "checkout_recognition_address_references"("referenceHash");
CREATE INDEX "checkout_recognition_address_references_recognitionSessionId_expiresAt_idx"
  ON "checkout_recognition_address_references"("recognitionSessionId", "expiresAt");
CREATE INDEX "checkout_recognition_address_references_tenantId_storeId_expiresAt_idx"
  ON "checkout_recognition_address_references"("tenantId", "storeId", "expiresAt");
CREATE INDEX "checkout_recognition_address_references_customerAddressId_expiresAt_idx"
  ON "checkout_recognition_address_references"("customerAddressId", "expiresAt");

CREATE UNIQUE INDEX "customer_recognition_throttles_tenantId_scope_keyHash_key"
  ON "customer_recognition_throttles"("tenantId", "scope", "keyHash");
CREATE INDEX "customer_recognition_throttles_expiresAt_idx"
  ON "customer_recognition_throttles"("expiresAt");
CREATE INDEX "customer_recognition_throttles_tenantId_storeId_blockedUntil_idx"
  ON "customer_recognition_throttles"("tenantId", "storeId", "blockedUntil");

ALTER TABLE "customer_address_store_uses"
  ADD CONSTRAINT "customer_address_store_uses_storeId_tenantId_fkey"
    FOREIGN KEY ("storeId", "tenantId")
    REFERENCES "stores"("id", "tenantId")
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "customer_address_store_uses_deliveryZoneId_tenantId_storeId_fkey"
    FOREIGN KEY ("deliveryZoneId", "tenantId", "storeId")
    REFERENCES "delivery_zones"("id", "tenantId", "storeId")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "checkout_recognition_sessions"
  ADD CONSTRAINT "checkout_recognition_sessions_storeId_tenantId_fkey"
    FOREIGN KEY ("storeId", "tenantId")
    REFERENCES "stores"("id", "tenantId")
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "checkout_recognition_sessions_customerId_fkey"
    FOREIGN KEY ("customerId")
    REFERENCES "customers"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "checkout_recognition_address_references"
  ADD CONSTRAINT "checkout_recognition_address_references_recognitionSessionId_fkey"
    FOREIGN KEY ("recognitionSessionId")
    REFERENCES "checkout_recognition_sessions"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "checkout_recognition_address_references_storeId_tenantId_fkey"
    FOREIGN KEY ("storeId", "tenantId")
    REFERENCES "stores"("id", "tenantId")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "customer_recognition_throttles"
  ADD CONSTRAINT "customer_recognition_throttles_tenantId_fkey"
    FOREIGN KEY ("tenantId")
    REFERENCES "tenants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "customer_recognition_throttles_storeId_tenantId_fkey"
    FOREIGN KEY ("storeId", "tenantId")
    REFERENCES "stores"("id", "tenantId")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "orders"
  DROP CONSTRAINT "orders_structured_delivery_address_check",
  ADD CONSTRAINT "orders_structured_delivery_address_optional_postal_check"
    CHECK (
      (
        "deliveryStreet" IS NULL
        AND "deliveryNumber" IS NULL
        AND "deliveryNeighborhood" IS NULL
        AND "deliveryCity" IS NULL
        AND "deliveryState" IS NULL
        AND "deliveryPostalCode" IS NULL
      )
      OR
      (
        char_length(btrim("deliveryStreet")) > 0
        AND char_length(btrim("deliveryNumber")) > 0
        AND char_length(btrim("deliveryNeighborhood")) > 0
        AND char_length(btrim("deliveryCity")) > 0
        AND "deliveryState" ~ '^[A-Z]{2}$'
        AND (
          "deliveryPostalCode" IS NULL
          OR "deliveryPostalCode" ~ '^[0-9]{8}$'
        )
      )
    ) NOT VALID;

CREATE FUNCTION public."_enforce_order_customer_tenant"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW."customerId" IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public."customers" customer
    WHERE customer."id" = NEW."customerId"
      AND customer."tenantId" = NEW."tenantId"
  ) THEN
    RAISE EXCEPTION 'Order customer must belong to the order tenant'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public."_enforce_order_customer_tenant"()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER "orders_customer_tenant_integrity"
BEFORE INSERT OR UPDATE OF "customerId", "tenantId"
ON "orders"
FOR EACH ROW
EXECUTE FUNCTION public."_enforce_order_customer_tenant"();

CREATE FUNCTION public."_enforce_recognition_session_customer_tenant"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW."customerId" IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public."customers" customer
    WHERE customer."id" = NEW."customerId"
      AND customer."tenantId" = NEW."tenantId"
  ) THEN
    RAISE EXCEPTION 'Recognition customer must belong to the recognition tenant'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public."_enforce_recognition_session_customer_tenant"()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER "checkout_recognition_sessions_customer_tenant_integrity"
BEFORE INSERT OR UPDATE OF "customerId", "tenantId"
ON "checkout_recognition_sessions"
FOR EACH ROW
EXECUTE FUNCTION public."_enforce_recognition_session_customer_tenant"();

ALTER TABLE "customer_address_store_uses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "checkout_recognition_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "checkout_recognition_address_references" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "customer_recognition_throttles" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "customer_address_store_uses" FROM anon, authenticated;
REVOKE ALL ON TABLE "checkout_recognition_sessions" FROM anon, authenticated;
REVOKE ALL ON TABLE "checkout_recognition_address_references" FROM anon, authenticated;
REVOKE ALL ON TABLE "customer_recognition_throttles" FROM anon, authenticated;

COMMIT;

-- MANUAL, DESTRUCTIVE ROLLBACK. Never execute through `prisma migrate deploy`.
-- Prefer deploying the previous application and retaining this additive data.
-- Export recognition/customer data and stop writes before running this file.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "orders"
    WHERE "deliveryStreet" IS NOT NULL
      AND "deliveryPostalCode" IS NULL
  ) THEN
    RAISE EXCEPTION
      'Recognition rollback blocked: delivery orders without postal code exist'
      USING ERRCODE = '23514';
  END IF;
END $$;

DROP TRIGGER IF EXISTS "checkout_recognition_address_references_scope_integrity"
  ON "checkout_recognition_address_references";
DROP FUNCTION IF EXISTS public."_enforce_recognition_reference_scope"();

DROP TRIGGER IF EXISTS "checkout_recognition_sessions_customer_tenant_integrity"
  ON "checkout_recognition_sessions";
DROP FUNCTION IF EXISTS public."_enforce_recognition_session_customer_tenant"();

DROP TRIGGER IF EXISTS "orders_customer_tenant_integrity" ON "orders";
DROP FUNCTION IF EXISTS public."_enforce_order_customer_tenant"();

DROP TABLE IF EXISTS "checkout_recognition_address_references";
DROP TABLE IF EXISTS "customer_recognition_throttles";
DROP TABLE IF EXISTS "checkout_recognition_sessions";
DROP TABLE IF EXISTS "customer_address_store_uses";

ALTER TABLE "customer_addresses"
  DROP CONSTRAINT IF EXISTS "customer_addresses_customerId_tenantId_fkey";

ALTER TABLE "customer_addresses"
  ADD CONSTRAINT "customer_addresses_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "customers"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

DROP INDEX IF EXISTS "customer_addresses_one_default_per_customer_key";
DROP INDEX IF EXISTS "customer_addresses_customerId_addressFingerprint_key";
DROP INDEX IF EXISTS "customer_addresses_id_tenantId_key";
DROP INDEX IF EXISTS "customer_addresses_tenantId_idx";
DROP INDEX IF EXISTS "customers_tenantId_phoneNormalized_key";
DROP INDEX IF EXISTS "customers_id_tenantId_key";

ALTER TABLE "customer_addresses"
  DROP CONSTRAINT IF EXISTS "customer_addresses_fingerprint_format_check",
  DROP COLUMN IF EXISTS "tenantId",
  DROP COLUMN IF EXISTS "label",
  DROP COLUMN IF EXISTS "addressFingerprint",
  DROP COLUMN IF EXISTS "lastUsedAt",
  DROP COLUMN IF EXISTS "updatedAt";

ALTER TABLE "customers"
  DROP CONSTRAINT IF EXISTS "customers_phone_normalized_format_check",
  DROP COLUMN IF EXISTS "phoneNormalized",
  DROP COLUMN IF EXISTS "lastOrderAt",
  DROP COLUMN IF EXISTS "recognitionEnabled";

ALTER TABLE "orders"
  DROP CONSTRAINT IF EXISTS "orders_structured_delivery_address_optional_postal_check",
  ADD CONSTRAINT "orders_structured_delivery_address_check"
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
        AND "deliveryPostalCode" ~ '^[0-9]{8}$'
      )
    );

DROP TYPE IF EXISTS "CustomerRecognitionThrottleScope";
DROP TYPE IF EXISTS "CheckoutRecognitionConfirmationMode";
DROP TYPE IF EXISTS "CustomerAddressLabel";

COMMIT;

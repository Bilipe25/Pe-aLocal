-- Validate the backfill, install final tenant guards and make the application
-- columns mandatory. Keep this migration short and retryable.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

DO $$
DECLARE
  index_name TEXT;
BEGIN
  FOREACH index_name IN ARRAY ARRAY[
    'customers_id_tenantId_key',
    'customers_tenantId_phoneNormalized_key',
    'customer_addresses_id_tenantId_key',
    'customer_addresses_customerId_addressFingerprint_key',
    'customer_addresses_one_default_per_customer_key',
    'customer_addresses_tenantId_idx'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_index index_config
      JOIN pg_catalog.pg_class index_class
        ON index_class.oid = index_config.indexrelid
      JOIN pg_catalog.pg_namespace index_namespace
        ON index_namespace.oid = index_class.relnamespace
      WHERE index_namespace.nspname = 'public'
        AND index_class.relname = index_name
        AND index_config.indisready
        AND index_config.indisvalid
    ) THEN
      RAISE EXCEPTION
        'Customer recognition guard blocked: required index % is missing or invalid',
        index_name
        USING ERRCODE = '55000';
    END IF;
  END LOOP;
END $$;

ALTER TABLE "customers"
  VALIDATE CONSTRAINT "customers_phone_normalized_required_check";
ALTER TABLE "customers"
  VALIDATE CONSTRAINT "customers_phone_normalized_format_check";
ALTER TABLE "customer_addresses"
  VALIDATE CONSTRAINT "customer_addresses_recognition_fields_required_check";
ALTER TABLE "customer_addresses"
  VALIDATE CONSTRAINT "customer_addresses_fingerprint_format_check";
ALTER TABLE "orders"
  VALIDATE CONSTRAINT "orders_structured_delivery_address_optional_postal_check";

ALTER TABLE "customers"
  ALTER COLUMN "phoneNormalized" SET NOT NULL;
ALTER TABLE "customer_addresses"
  ALTER COLUMN "tenantId" SET NOT NULL,
  ALTER COLUMN "addressFingerprint" SET NOT NULL,
  ALTER COLUMN "updatedAt" SET NOT NULL;

ALTER TABLE "customers"
  DROP CONSTRAINT "customers_phone_normalized_required_check";
ALTER TABLE "customer_addresses"
  DROP CONSTRAINT "customer_addresses_recognition_fields_required_check";

ALTER TABLE "customer_addresses"
  ADD CONSTRAINT "customer_addresses_customerId_tenantId_fkey"
    FOREIGN KEY ("customerId", "tenantId")
    REFERENCES "customers"("id", "tenantId")
    ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;

ALTER TABLE "customer_address_store_uses"
  ADD CONSTRAINT "customer_address_store_uses_customerAddressId_tenantId_fkey"
    FOREIGN KEY ("customerAddressId", "tenantId")
    REFERENCES "customer_addresses"("id", "tenantId")
    ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;

ALTER TABLE "checkout_recognition_address_references"
  ADD CONSTRAINT "checkout_recognition_address_references_customerId_tenantId_fkey"
    FOREIGN KEY ("customerId", "tenantId")
    REFERENCES "customers"("id", "tenantId")
    ON DELETE CASCADE ON UPDATE CASCADE NOT VALID,
  ADD CONSTRAINT "checkout_recognition_address_references_customerAddressId_tenantId_fkey"
    FOREIGN KEY ("customerAddressId", "tenantId")
    REFERENCES "customer_addresses"("id", "tenantId")
    ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;

ALTER TABLE "customer_addresses"
  VALIDATE CONSTRAINT "customer_addresses_customerId_tenantId_fkey";
ALTER TABLE "customer_address_store_uses"
  VALIDATE CONSTRAINT "customer_address_store_uses_customerAddressId_tenantId_fkey";
ALTER TABLE "checkout_recognition_address_references"
  VALIDATE CONSTRAINT "checkout_recognition_address_references_customerId_tenantId_fkey";
ALTER TABLE "checkout_recognition_address_references"
  VALIDATE CONSTRAINT "checkout_recognition_address_references_customerAddressId_tenantId_fkey";

ALTER TABLE "customer_addresses"
  DROP CONSTRAINT "customer_addresses_customerId_fkey";

CREATE FUNCTION public."_enforce_recognition_reference_scope"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public."checkout_recognition_sessions" recognition_session
    WHERE recognition_session."id" = NEW."recognitionSessionId"
      AND recognition_session."tenantId" = NEW."tenantId"
      AND recognition_session."storeId" = NEW."storeId"
      AND recognition_session."customerId" = NEW."customerId"
  ) THEN
    RAISE EXCEPTION 'Recognition reference must match its session scope'
      USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public."customer_addresses" address
    WHERE address."id" = NEW."customerAddressId"
      AND address."tenantId" = NEW."tenantId"
      AND address."customerId" = NEW."customerId"
  ) THEN
    RAISE EXCEPTION 'Recognition reference must match its customer address scope'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public."_enforce_recognition_reference_scope"()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER "checkout_recognition_address_references_scope_integrity"
BEFORE INSERT OR UPDATE OF
  "recognitionSessionId", "tenantId", "storeId", "customerId", "customerAddressId"
ON "checkout_recognition_address_references"
FOR EACH ROW
EXECUTE FUNCTION public."_enforce_recognition_reference_scope"();

COMMIT;

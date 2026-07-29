-- Persistent storefront device recognition.
-- Recognition remains unauthenticated and may only expose masked DTOs.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

CREATE TABLE "storefront_devices" (
  "id" TEXT NOT NULL,
  "tokenHash" CHAR(64) NOT NULL,
  "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "storefront_devices_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "storefront_devices_token_hash_check"
    CHECK ("tokenHash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "storefront_devices_expiry_check"
    CHECK ("expiresAt" > "createdAt")
);

CREATE TABLE "customer_device_recognitions" (
  "id" TEXT NOT NULL,
  "storefrontDeviceId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "customer_device_recognitions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "customer_device_recognitions_expiry_check"
    CHECK ("expiresAt" > "createdAt"),
  CONSTRAINT "customer_device_recognitions_revocation_check"
    CHECK ("revokedAt" IS NULL OR "revokedAt" >= "createdAt")
);

ALTER TABLE "checkout_recognition_sessions"
  ADD COLUMN "deviceRecognitionId" TEXT;

CREATE UNIQUE INDEX "storefront_devices_tokenHash_key"
  ON "storefront_devices"("tokenHash");
CREATE INDEX "storefront_devices_expiresAt_idx"
  ON "storefront_devices"("expiresAt");

CREATE UNIQUE INDEX "customer_device_recognitions_storefrontDeviceId_storeId_key"
  ON "customer_device_recognitions"("storefrontDeviceId", "storeId");
CREATE UNIQUE INDEX "customer_device_recognitions_id_tenantId_storeId_customerId_key"
  ON "customer_device_recognitions"("id", "tenantId", "storeId", "customerId");
CREATE INDEX "customer_device_recognitions_tenantId_storeId_expiresAt_idx"
  ON "customer_device_recognitions"("tenantId", "storeId", "expiresAt");
CREATE INDEX "customer_device_recognitions_customerId_storeId_revokedAt_lastUsedAt_idx"
  ON "customer_device_recognitions"("customerId", "storeId", "revokedAt", "lastUsedAt");
CREATE INDEX "customer_device_recognitions_storefrontDeviceId_expiresAt_idx"
  ON "customer_device_recognitions"("storefrontDeviceId", "expiresAt");
CREATE INDEX "checkout_recognition_sessions_deviceRecognitionId_expiresAt_idx"
  ON "checkout_recognition_sessions"("deviceRecognitionId", "expiresAt");

ALTER TABLE "customer_device_recognitions"
  ADD CONSTRAINT "customer_device_recognitions_storefrontDeviceId_fkey"
    FOREIGN KEY ("storefrontDeviceId")
    REFERENCES "storefront_devices"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "customer_device_recognitions_tenantId_fkey"
    FOREIGN KEY ("tenantId")
    REFERENCES "tenants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "customer_device_recognitions_storeId_tenantId_fkey"
    FOREIGN KEY ("storeId", "tenantId")
    REFERENCES "stores"("id", "tenantId")
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "customer_device_recognitions_customerId_tenantId_fkey"
    FOREIGN KEY ("customerId", "tenantId")
    REFERENCES "customers"("id", "tenantId")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "checkout_recognition_sessions"
  ADD CONSTRAINT "checkout_recognition_sessions_deviceRecognitionId_fkey"
    FOREIGN KEY ("deviceRecognitionId")
    REFERENCES "customer_device_recognitions"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE FUNCTION public."_enforce_device_recognition_session_scope"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW."deviceRecognitionId" IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public."customer_device_recognitions" recognition
    WHERE recognition."id" = NEW."deviceRecognitionId"
      AND recognition."tenantId" = NEW."tenantId"
      AND recognition."storeId" = NEW."storeId"
      AND recognition."customerId" = NEW."customerId"
  ) THEN
    RAISE EXCEPTION 'Device recognition must match its checkout session scope'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public."_enforce_device_recognition_session_scope"()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER "checkout_recognition_sessions_device_scope_integrity"
BEFORE INSERT OR UPDATE OF
  "deviceRecognitionId", "tenantId", "storeId", "customerId"
ON "checkout_recognition_sessions"
FOR EACH ROW
EXECUTE FUNCTION public."_enforce_device_recognition_session_scope"();

ALTER TABLE "storefront_devices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "customer_device_recognitions" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "storefront_devices" FROM anon, authenticated;
REVOKE ALL ON TABLE "customer_device_recognitions" FROM anon, authenticated;

COMMIT;

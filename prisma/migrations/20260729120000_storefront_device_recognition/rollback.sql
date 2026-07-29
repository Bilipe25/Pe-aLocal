-- MANUAL, DESTRUCTIVE ROLLBACK. Never run through `prisma migrate deploy`.
-- Prefer deploying the previous application and preserving these additive tables.
-- Export device-recognition data and stop writes before running this file.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

DROP TRIGGER IF EXISTS "checkout_recognition_sessions_device_scope_integrity"
  ON "checkout_recognition_sessions";
DROP FUNCTION IF EXISTS public."_enforce_device_recognition_session_scope"();

ALTER TABLE "checkout_recognition_sessions"
  DROP CONSTRAINT IF EXISTS "checkout_recognition_sessions_deviceRecognitionId_fkey",
  DROP COLUMN IF EXISTS "deviceRecognitionId";

DROP TABLE IF EXISTS "customer_device_recognitions";
DROP TABLE IF EXISTS "storefront_devices";

COMMIT;

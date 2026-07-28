-- The validated CHECK from the previous migration lets PostgreSQL prove that
-- the column contains no nulls without scanning `orders` again. Isolate the
-- ACCESS EXCLUSIVE lock in this short, retryable migration.
BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE "orders"
  ALTER COLUMN "publicTokenExpiresAt" SET NOT NULL;
ALTER TABLE "orders"
  DROP CONSTRAINT "orders_public_token_expiry_not_null_check";

COMMIT;

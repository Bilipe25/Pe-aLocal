-- Idempotent backfill with one table scan. Keep this migration on the direct
-- database connection and measure `orders` before production rollout.
SET lock_timeout = '5s';
SET statement_timeout = '15min';

UPDATE "orders"
SET "publicTokenExpiresAt" = "createdAt" + INTERVAL '30 days'
WHERE "publicTokenExpiresAt" IS NULL;

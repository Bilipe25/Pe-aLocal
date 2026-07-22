ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "customerPhoneNormalized" TEXT;

CREATE OR REPLACE FUNCTION "_normalize_order_phone"(value TEXT)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT CASE
    WHEN length(regexp_replace(value, '\D', '', 'g')) IN (10, 11)
      THEN '55' || regexp_replace(value, '\D', '', 'g')
    ELSE regexp_replace(value, '\D', '', 'g')
  END
$$;

-- Independent hash buckets keep each backfill transaction bounded.
UPDATE "orders" SET "customerPhoneNormalized" = "_normalize_order_phone"("customerPhone") WHERE "customerPhoneNormalized" IS NULL AND mod(abs(hashtext("id")::bigint), 8) = 0;
UPDATE "orders" SET "customerPhoneNormalized" = "_normalize_order_phone"("customerPhone") WHERE "customerPhoneNormalized" IS NULL AND mod(abs(hashtext("id")::bigint), 8) = 1;
UPDATE "orders" SET "customerPhoneNormalized" = "_normalize_order_phone"("customerPhone") WHERE "customerPhoneNormalized" IS NULL AND mod(abs(hashtext("id")::bigint), 8) = 2;
UPDATE "orders" SET "customerPhoneNormalized" = "_normalize_order_phone"("customerPhone") WHERE "customerPhoneNormalized" IS NULL AND mod(abs(hashtext("id")::bigint), 8) = 3;
UPDATE "orders" SET "customerPhoneNormalized" = "_normalize_order_phone"("customerPhone") WHERE "customerPhoneNormalized" IS NULL AND mod(abs(hashtext("id")::bigint), 8) = 4;
UPDATE "orders" SET "customerPhoneNormalized" = "_normalize_order_phone"("customerPhone") WHERE "customerPhoneNormalized" IS NULL AND mod(abs(hashtext("id")::bigint), 8) = 5;
UPDATE "orders" SET "customerPhoneNormalized" = "_normalize_order_phone"("customerPhone") WHERE "customerPhoneNormalized" IS NULL AND mod(abs(hashtext("id")::bigint), 8) = 6;
UPDATE "orders" SET "customerPhoneNormalized" = "_normalize_order_phone"("customerPhone") WHERE "customerPhoneNormalized" IS NULL AND mod(abs(hashtext("id")::bigint), 8) = 7;

DROP FUNCTION "_normalize_order_phone"(TEXT);

CREATE INDEX CONCURRENTLY IF NOT EXISTS "orders_tenantId_storeId_createdAt_id_idx"
  ON "orders"("tenantId", "storeId", "createdAt", "id");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "orders_storeId_status_createdAt_id_idx"
  ON "orders"("storeId", "status", "createdAt", "id");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "orders_storeId_paymentStatus_createdAt_id_idx"
  ON "orders"("storeId", "paymentStatus", "createdAt", "id");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "orders_storeId_status_statusChangedAt_id_idx"
  ON "orders"("storeId", "status", "statusChangedAt", "id");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "orders_storeId_customerPhoneNormalized_createdAt_id_idx"
  ON "orders"("storeId", "customerPhoneNormalized", "createdAt", "id");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "order_status_history_orderId_createdAt_id_idx"
  ON "order_status_history"("orderId", "createdAt", "id");

DROP INDEX CONCURRENTLY IF EXISTS "order_status_history_orderId_createdAt_idx";

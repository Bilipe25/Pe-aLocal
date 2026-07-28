-- MANUAL ROLLBACK — do not execute through `prisma migrate deploy`.
--
-- Operational rollback should normally deploy the previous application while
-- leaving these additive columns in place. Run this destructive SQL only after
-- exporting orders, postal ranges and coupon ownership created by checkout v2.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "coupons"
    GROUP BY "tenantId", "code"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Rollback blocked: duplicate coupon codes exist inside a tenant'
      USING ERRCODE = '23505';
  END IF;
END $$;

ALTER TABLE "coupons" DROP CONSTRAINT IF EXISTS "coupons_storeId_tenantId_fkey";
ALTER TABLE "coupons" DROP CONSTRAINT IF EXISTS "coupons_active_requires_store_check";
ALTER TABLE "coupon_usages" DROP CONSTRAINT IF EXISTS "coupon_usages_orderId_fkey";
ALTER TABLE "coupon_usages" DROP CONSTRAINT IF EXISTS "coupon_usages_discount_check";
DROP INDEX IF EXISTS "coupon_usages_couponId_orderId_key";
DROP INDEX IF EXISTS "coupons_tenantId_storeId_isActive_idx";
DROP INDEX IF EXISTS "coupons_tenantId_storeId_code_key";
CREATE UNIQUE INDEX IF NOT EXISTS "coupons_tenantId_code_key"
  ON "coupons"("tenantId", "code");
ALTER TABLE "coupons" DROP COLUMN IF EXISTS "storeId";

DROP TABLE IF EXISTS "delivery_zone_postal_ranges";
DROP FUNCTION IF EXISTS public."_prevent_delivery_postal_range_overlap"();
DROP INDEX IF EXISTS "delivery_zones_id_tenantId_storeId_key";
DROP INDEX IF EXISTS "orders_publicTokenExpiresAt_idx";

ALTER TABLE "delivery_zones"
  ADD CONSTRAINT "delivery_zones_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "stores"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "delivery_zones"
  DROP CONSTRAINT IF EXISTS "delivery_zones_storeId_tenantId_fkey";

ALTER TABLE "orders"
  DROP CONSTRAINT IF EXISTS "orders_public_token_expiry_not_null_check",
  DROP CONSTRAINT IF EXISTS "orders_values_nonnegative_check",
  DROP CONSTRAINT IF EXISTS "orders_discount_within_subtotal_check",
  DROP CONSTRAINT IF EXISTS "orders_total_consistency_check",
  DROP CONSTRAINT IF EXISTS "orders_delivery_postal_code_check",
  DROP CONSTRAINT IF EXISTS "orders_promised_window_check",
  DROP CONSTRAINT IF EXISTS "orders_quote_fingerprint_check",
  DROP CONSTRAINT IF EXISTS "orders_public_token_expiry_check",
  DROP CONSTRAINT IF EXISTS "orders_structured_delivery_address_check",
  DROP COLUMN IF EXISTS "quoteFingerprint",
  DROP COLUMN IF EXISTS "publicTokenExpiresAt",
  DROP COLUMN IF EXISTS "deliveryPostalCode",
  DROP COLUMN IF EXISTS "deliveryStreet",
  DROP COLUMN IF EXISTS "deliveryNumber",
  DROP COLUMN IF EXISTS "deliveryComplement",
  DROP COLUMN IF EXISTS "deliveryNeighborhood",
  DROP COLUMN IF EXISTS "deliveryCity",
  DROP COLUMN IF EXISTS "deliveryState",
  DROP COLUMN IF EXISTS "deliveryReference",
  DROP COLUMN IF EXISTS "promisedFulfillmentMinAt",
  DROP COLUMN IF EXISTS "promisedFulfillmentMaxAt";

ALTER TABLE "order_items"
  DROP CONSTRAINT IF EXISTS "order_items_quantity_check",
  DROP CONSTRAINT IF EXISTS "order_items_values_nonnegative_check",
  DROP CONSTRAINT IF EXISTS "order_items_total_consistency_check";
ALTER TABLE "order_item_options"
  DROP CONSTRAINT IF EXISTS "order_item_options_price_nonnegative_check";
ALTER TABLE "delivery_zones"
  DROP CONSTRAINT IF EXISTS "delivery_zones_values_nonnegative_check";
ALTER TABLE "coupons"
  DROP CONSTRAINT IF EXISTS "coupons_values_check";

COMMIT;

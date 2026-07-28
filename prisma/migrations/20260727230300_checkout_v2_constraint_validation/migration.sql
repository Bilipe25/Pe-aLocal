-- Validation is intentionally separated from schema expansion/backfill.
-- PostgreSQL uses a lighter lock for VALIDATE CONSTRAINT than for adding a
-- fully validated constraint to an existing table.
BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

ALTER TABLE "orders"
  VALIDATE CONSTRAINT "orders_public_token_expiry_not_null_check";

ALTER TABLE "orders" VALIDATE CONSTRAINT "orders_values_nonnegative_check";
ALTER TABLE "orders" VALIDATE CONSTRAINT "orders_discount_within_subtotal_check";
ALTER TABLE "orders" VALIDATE CONSTRAINT "orders_total_consistency_check";
ALTER TABLE "orders" VALIDATE CONSTRAINT "orders_delivery_postal_code_check";
ALTER TABLE "orders" VALIDATE CONSTRAINT "orders_promised_window_check";
ALTER TABLE "orders" VALIDATE CONSTRAINT "orders_quote_fingerprint_check";
ALTER TABLE "orders" VALIDATE CONSTRAINT "orders_public_token_expiry_check";
ALTER TABLE "orders" VALIDATE CONSTRAINT "orders_structured_delivery_address_check";
ALTER TABLE "order_items" VALIDATE CONSTRAINT "order_items_quantity_check";
ALTER TABLE "order_items" VALIDATE CONSTRAINT "order_items_values_nonnegative_check";
ALTER TABLE "order_items" VALIDATE CONSTRAINT "order_items_total_consistency_check";
ALTER TABLE "order_item_options"
  VALIDATE CONSTRAINT "order_item_options_price_nonnegative_check";
ALTER TABLE "delivery_zones"
  VALIDATE CONSTRAINT "delivery_zones_values_nonnegative_check";
ALTER TABLE "delivery_zones"
  VALIDATE CONSTRAINT "delivery_zones_storeId_tenantId_fkey";
ALTER TABLE "delivery_zones"
  DROP CONSTRAINT "delivery_zones_storeId_fkey";
ALTER TABLE "coupons" VALIDATE CONSTRAINT "coupons_values_check";
ALTER TABLE "coupons" VALIDATE CONSTRAINT "coupons_active_requires_store_check";
ALTER TABLE "coupon_usages" VALIDATE CONSTRAINT "coupon_usages_discount_check";
ALTER TABLE "coupon_usages" VALIDATE CONSTRAINT "coupon_usages_orderId_fkey";

COMMIT;

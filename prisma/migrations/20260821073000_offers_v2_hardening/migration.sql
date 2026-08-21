BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

CREATE TYPE "StoreOfferKind" AS ENUM (
  'COMBO_FIXED', 'COMBO_FLEXIBLE', 'PRODUCT_FIXED_PRICE', 'QUANTITY_FIXED_PRICE',
  'BOGO', 'CART_FIXED_DISCOUNT', 'FREE_DELIVERY'
);
CREATE TYPE "StoreOfferModality" AS ENUM ('DELIVERY', 'PICKUP', 'DINE_IN');
CREATE TYPE "StoreOfferDiscountType" AS ENUM ('FIXED', 'PERCENTAGE');
CREATE TYPE "StoreOfferUsageStatus" AS ENUM ('RESERVED', 'CONSUMED', 'RELEASED', 'EXPIRED');

ALTER TYPE "OrderOfferType" ADD VALUE IF NOT EXISTS 'FLEXIBLE_COMBO';
ALTER TYPE "OrderPriceAdjustmentType" ADD VALUE IF NOT EXISTS 'QUANTITY_PROMOTION';
ALTER TYPE "OrderPriceAdjustmentType" ADD VALUE IF NOT EXISTS 'BOGO';
ALTER TYPE "OrderPriceAdjustmentType" ADD VALUE IF NOT EXISTS 'CART_DISCOUNT';
ALTER TYPE "OrderPriceAdjustmentType" ADD VALUE IF NOT EXISTS 'FREE_DELIVERY';

CREATE TABLE "store_offers" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenantId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "kind" "StoreOfferKind" NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "description" VARCHAR(500),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "version" INTEGER NOT NULL DEFAULT 0,
  "modalities" "StoreOfferModality"[] NOT NULL DEFAULT ARRAY[]::"StoreOfferModality"[],
  "startsOn" DATE,
  "endsOnExclusive" DATE,
  "weekdays" "DayOfWeek"[] NOT NULL DEFAULT ARRAY[]::"DayOfWeek"[],
  "startMinute" INTEGER,
  "endMinuteExclusive" INTEGER,
  "maxTotalUses" INTEGER,
  "maxUsesPerCustomer" INTEGER,
  "maxApplicationsPerOrder" INTEGER NOT NULL DEFAULT 1,
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "store_offers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "store_offers_name_check" CHECK (length(btrim("name")) BETWEEN 1 AND 120),
  CONSTRAINT "store_offers_version_check" CHECK ("version" >= 0),
  CONSTRAINT "store_offers_limits_check" CHECK (
    ("maxTotalUses" IS NULL OR "maxTotalUses" > 0) AND
    ("maxUsesPerCustomer" IS NULL OR "maxUsesPerCustomer" > 0) AND
    "maxApplicationsPerOrder" > 0
  ),
  CONSTRAINT "store_offers_date_window_check" CHECK (
    "startsOn" IS NULL OR "endsOnExclusive" IS NULL OR "startsOn" < "endsOnExclusive"
  ),
  CONSTRAINT "store_offers_time_window_check" CHECK (
    ("startMinute" IS NULL AND "endMinuteExclusive" IS NULL) OR
    ("startMinute" BETWEEN 0 AND 1439 AND "endMinuteExclusive" BETWEEN 0 AND 1439 AND "startMinute" <> "endMinuteExclusive")
  )
);

CREATE TABLE "store_offer_combos" (
  "offerId" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "storeId" TEXT NOT NULL,
  "fixedPrice" INTEGER NOT NULL,
  CONSTRAINT "store_offer_combos_pkey" PRIMARY KEY ("offerId"),
  CONSTRAINT "store_offer_combos_price_check" CHECK ("fixedPrice" > 0)
);
CREATE TABLE "store_offer_combo_groups" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "offerId" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "storeId" TEXT NOT NULL,
  "name" VARCHAR(80) NOT NULL, "quantity" INTEGER NOT NULL DEFAULT 1, "position" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "store_offer_combo_groups_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "store_offer_combo_groups_shape_check" CHECK (length(btrim("name")) BETWEEN 1 AND 80 AND "quantity" > 0 AND "position" >= 0),
  CONSTRAINT "store_offer_combo_groups_offer_position_key" UNIQUE ("offerId", "position")
);
CREATE TABLE "store_offer_combo_choices" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "groupId" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "storeId" TEXT NOT NULL,
  "productId" TEXT NOT NULL, "priceDelta" INTEGER NOT NULL DEFAULT 0, "position" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "store_offer_combo_choices_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "store_offer_combo_choices_shape_check" CHECK ("priceDelta" >= 0 AND "position" >= 0),
  CONSTRAINT "store_offer_combo_choices_group_product_key" UNIQUE ("groupId", "productId")
);
CREATE TABLE "store_offer_product_prices" (
  "offerId" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "storeId" TEXT NOT NULL,
  "productId" TEXT NOT NULL, "fixedPrice" INTEGER NOT NULL,
  CONSTRAINT "store_offer_product_prices_pkey" PRIMARY KEY ("offerId"),
  CONSTRAINT "store_offer_product_prices_price_check" CHECK ("fixedPrice" > 0)
);
CREATE TABLE "store_offer_quantity_prices" (
  "offerId" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "storeId" TEXT NOT NULL,
  "productId" TEXT NOT NULL, "requiredQuantity" INTEGER NOT NULL, "groupFixedPrice" INTEGER NOT NULL,
  CONSTRAINT "store_offer_quantity_prices_pkey" PRIMARY KEY ("offerId"),
  CONSTRAINT "store_offer_quantity_prices_shape_check" CHECK ("requiredQuantity" > 1 AND "groupFixedPrice" > 0)
);
CREATE TABLE "store_offer_bogos" (
  "offerId" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "storeId" TEXT NOT NULL,
  "productId" TEXT NOT NULL, "buyQuantity" INTEGER NOT NULL, "getQuantity" INTEGER NOT NULL,
  CONSTRAINT "store_offer_bogos_pkey" PRIMARY KEY ("offerId"),
  CONSTRAINT "store_offer_bogos_shape_check" CHECK ("buyQuantity" > 0 AND "getQuantity" > 0)
);
CREATE TABLE "store_offer_cart_discounts" (
  "offerId" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "storeId" TEXT NOT NULL,
  "discountType" "StoreOfferDiscountType" NOT NULL, "value" INTEGER NOT NULL,
  "minSubtotal" INTEGER NOT NULL DEFAULT 0, "maxDiscount" INTEGER,
  CONSTRAINT "store_offer_cart_discounts_pkey" PRIMARY KEY ("offerId"),
  CONSTRAINT "store_offer_cart_discounts_shape_check" CHECK (
    "value" > 0 AND "minSubtotal" >= 0 AND ("maxDiscount" IS NULL OR "maxDiscount" > 0) AND
    ("discountType" <> 'PERCENTAGE' OR "value" <= 100)
  )
);
CREATE TABLE "store_offer_free_deliveries" (
  "offerId" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "storeId" TEXT NOT NULL,
  "minSubtotal" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "store_offer_free_deliveries_pkey" PRIMARY KEY ("offerId"),
  CONSTRAINT "store_offer_free_deliveries_min_check" CHECK ("minSubtotal" >= 0)
);
CREATE TABLE "store_offer_usages" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenantId" TEXT NOT NULL, "storeId" TEXT NOT NULL, "offerId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL, "customerId" TEXT,
  "status" "StoreOfferUsageStatus" NOT NULL DEFAULT 'RESERVED',
  "applicationCount" INTEGER NOT NULL DEFAULT 1, "discountAmount" INTEGER NOT NULL,
  "expiresAt" TIMESTAMP(3), "consumedAt" TIMESTAMP(3), "releasedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "store_offer_usages_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "store_offer_usages_offer_order_key" UNIQUE ("offerId", "orderId"),
  CONSTRAINT "store_offer_usages_amount_check" CHECK ("applicationCount" > 0 AND "discountAmount" >= 0)
);

CREATE UNIQUE INDEX "store_offers_id_tenantId_storeId_key" ON "store_offers"("id", "tenantId", "storeId");
CREATE INDEX "store_offers_active_idx" ON "store_offers"("tenantId", "storeId", "isActive", "archivedAt", "sortOrder", "id");
CREATE INDEX "store_offers_kind_updated_idx" ON "store_offers"("tenantId", "storeId", "kind", "updatedAt", "id");
CREATE UNIQUE INDEX "store_offer_combos_scope_key" ON "store_offer_combos"("offerId", "tenantId", "storeId");
CREATE UNIQUE INDEX "store_offer_combo_groups_scope_key" ON "store_offer_combo_groups"("id", "tenantId", "storeId");
CREATE INDEX "store_offer_combo_groups_order_idx" ON "store_offer_combo_groups"("offerId", "position", "id");
CREATE INDEX "store_offer_combo_choices_order_idx" ON "store_offer_combo_choices"("groupId", "position", "id");
CREATE INDEX "store_offer_combo_choices_product_idx" ON "store_offer_combo_choices"("tenantId", "storeId", "productId");
CREATE UNIQUE INDEX "store_offer_product_prices_scope_key" ON "store_offer_product_prices"("offerId", "tenantId", "storeId");
CREATE UNIQUE INDEX "store_offer_quantity_prices_scope_key" ON "store_offer_quantity_prices"("offerId", "tenantId", "storeId");
CREATE UNIQUE INDEX "store_offer_bogos_scope_key" ON "store_offer_bogos"("offerId", "tenantId", "storeId");
CREATE UNIQUE INDEX "store_offer_cart_discounts_scope_key" ON "store_offer_cart_discounts"("offerId", "tenantId", "storeId");
CREATE UNIQUE INDEX "store_offer_free_deliveries_scope_key" ON "store_offer_free_deliveries"("offerId", "tenantId", "storeId");
CREATE INDEX "store_offer_usages_status_idx" ON "store_offer_usages"("tenantId", "storeId", "status", "expiresAt");
CREATE INDEX "store_offer_usages_offer_idx" ON "store_offer_usages"("offerId", "status", "createdAt");
CREATE INDEX "store_offer_usages_customer_idx" ON "store_offer_usages"("customerId", "offerId", "status");
CREATE INDEX "store_offer_usages_order_idx" ON "store_offer_usages"("orderId");

ALTER TABLE "store_offers"
  ADD CONSTRAINT "store_offers_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "store_offers_store_scope_fkey" FOREIGN KEY ("storeId", "tenantId") REFERENCES "stores"("id", "tenantId") ON DELETE CASCADE;
ALTER TABLE "store_offer_combos"
  ADD CONSTRAINT "store_offer_combos_offer_scope_fkey" FOREIGN KEY ("offerId", "tenantId", "storeId") REFERENCES "store_offers"("id", "tenantId", "storeId") ON DELETE CASCADE;
ALTER TABLE "store_offer_combo_groups"
  ADD CONSTRAINT "store_offer_combo_groups_combo_scope_fkey" FOREIGN KEY ("offerId", "tenantId", "storeId") REFERENCES "store_offer_combos"("offerId", "tenantId", "storeId") ON DELETE CASCADE;
ALTER TABLE "store_offer_combo_choices"
  ADD CONSTRAINT "store_offer_combo_choices_group_scope_fkey" FOREIGN KEY ("groupId", "tenantId", "storeId") REFERENCES "store_offer_combo_groups"("id", "tenantId", "storeId") ON DELETE CASCADE,
  ADD CONSTRAINT "store_offer_combo_choices_product_scope_fkey" FOREIGN KEY ("productId", "tenantId", "storeId") REFERENCES "products"("id", "tenantId", "storeId") ON DELETE RESTRICT;
ALTER TABLE "store_offer_product_prices"
  ADD CONSTRAINT "store_offer_product_prices_offer_scope_fkey" FOREIGN KEY ("offerId", "tenantId", "storeId") REFERENCES "store_offers"("id", "tenantId", "storeId") ON DELETE CASCADE,
  ADD CONSTRAINT "store_offer_product_prices_product_scope_fkey" FOREIGN KEY ("productId", "tenantId", "storeId") REFERENCES "products"("id", "tenantId", "storeId") ON DELETE RESTRICT;
ALTER TABLE "store_offer_quantity_prices"
  ADD CONSTRAINT "store_offer_quantity_prices_offer_scope_fkey" FOREIGN KEY ("offerId", "tenantId", "storeId") REFERENCES "store_offers"("id", "tenantId", "storeId") ON DELETE CASCADE,
  ADD CONSTRAINT "store_offer_quantity_prices_product_scope_fkey" FOREIGN KEY ("productId", "tenantId", "storeId") REFERENCES "products"("id", "tenantId", "storeId") ON DELETE RESTRICT;
ALTER TABLE "store_offer_bogos"
  ADD CONSTRAINT "store_offer_bogos_offer_scope_fkey" FOREIGN KEY ("offerId", "tenantId", "storeId") REFERENCES "store_offers"("id", "tenantId", "storeId") ON DELETE CASCADE,
  ADD CONSTRAINT "store_offer_bogos_product_scope_fkey" FOREIGN KEY ("productId", "tenantId", "storeId") REFERENCES "products"("id", "tenantId", "storeId") ON DELETE RESTRICT;
ALTER TABLE "store_offer_cart_discounts" ADD CONSTRAINT "store_offer_cart_discounts_offer_scope_fkey" FOREIGN KEY ("offerId", "tenantId", "storeId") REFERENCES "store_offers"("id", "tenantId", "storeId") ON DELETE CASCADE;
ALTER TABLE "store_offer_free_deliveries" ADD CONSTRAINT "store_offer_free_deliveries_offer_scope_fkey" FOREIGN KEY ("offerId", "tenantId", "storeId") REFERENCES "store_offers"("id", "tenantId", "storeId") ON DELETE CASCADE;
ALTER TABLE "store_offer_usages"
  ADD CONSTRAINT "store_offer_usages_offer_scope_fkey" FOREIGN KEY ("offerId", "tenantId", "storeId") REFERENCES "store_offers"("id", "tenantId", "storeId") ON DELETE CASCADE,
  ADD CONSTRAINT "store_offer_usages_order_scope_fkey" FOREIGN KEY ("orderId", "tenantId", "storeId") REFERENCES "orders"("id", "tenantId", "storeId") ON DELETE CASCADE;

-- Backfill determinístico: os IDs V1 tornam-se os IDs canônicos V2.
INSERT INTO "store_offers" (
  "id", "tenantId", "storeId", "kind", "name", "description", "isActive", "sortOrder", "version",
  "startsOn", "endsOnExclusive", "weekdays", "startMinute", "endMinuteExclusive", "archivedAt", "createdAt", "updatedAt"
)
SELECT "id", "tenantId", "storeId", 'COMBO_FIXED', "name", "description", "isActive", "sortOrder", "version",
       "startsOn", "endsOnExclusive", "weekdays", "startMinute", "endMinuteExclusive", "archivedAt", "createdAt", "updatedAt"
FROM "store_combos";
INSERT INTO "store_offer_combos" ("offerId", "tenantId", "storeId", "fixedPrice")
SELECT "id", "tenantId", "storeId", "specialPrice" FROM "store_combos";
INSERT INTO "store_offer_combo_groups" ("id", "offerId", "tenantId", "storeId", "name", "quantity", "position")
SELECT i."id", i."comboId", i."tenantId", i."storeId", p."name", i."quantity", i."position"
FROM "store_combo_items" i JOIN "products" p ON p."id" = i."productId" AND p."tenantId" = i."tenantId" AND p."storeId" = i."storeId";
INSERT INTO "store_offer_combo_choices" ("groupId", "tenantId", "storeId", "productId", "priceDelta", "position")
SELECT "id", "tenantId", "storeId", "productId", 0, 0 FROM "store_combo_items";

INSERT INTO "store_offers" (
  "id", "tenantId", "storeId", "kind", "name", "isActive", "version",
  "startsOn", "endsOnExclusive", "weekdays", "startMinute", "endMinuteExclusive", "archivedAt", "createdAt", "updatedAt"
)
SELECT sp."id", sp."tenantId", sp."storeId", 'PRODUCT_FIXED_PRICE', left('Promoção: ' || p."name", 120), sp."isActive", sp."version",
       sp."startsOn", sp."endsOnExclusive", sp."weekdays", sp."startMinute", sp."endMinuteExclusive", sp."archivedAt", sp."createdAt", sp."updatedAt"
FROM "store_product_promotions" sp JOIN "products" p ON p."id" = sp."productId" AND p."tenantId" = sp."tenantId" AND p."storeId" = sp."storeId";
INSERT INTO "store_offer_product_prices" ("offerId", "tenantId", "storeId", "productId", "fixedPrice")
SELECT "id", "tenantId", "storeId", "productId", "promotionalPrice" FROM "store_product_promotions";

-- Preflight e reforço de pertencimento dos snapshots V1.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "order_items" i JOIN "order_offer_groups" g ON g."id" = i."offerGroupId"
    WHERE i."orderId" <> g."orderId"
  ) OR EXISTS (
    SELECT 1 FROM "order_price_adjustments" a JOIN "order_items" i ON i."id" = a."orderItemId"
    WHERE a."orderId" <> i."orderId"
  ) OR EXISTS (
    SELECT 1 FROM "order_price_adjustments" a JOIN "order_offer_groups" g ON g."id" = a."orderOfferGroupId"
    WHERE a."orderId" <> g."orderId"
  ) THEN
    RAISE EXCEPTION 'Snapshot de oferta associado a pedido diferente; migration abortada.';
  END IF;
END $$;
CREATE UNIQUE INDEX "order_items_id_orderId_key" ON "order_items"("id", "orderId");
CREATE UNIQUE INDEX "order_offer_groups_id_orderId_key" ON "order_offer_groups"("id", "orderId");
ALTER TABLE "order_items" DROP CONSTRAINT "order_items_offerGroupId_fkey";
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_offerGroupId_orderId_fkey" FOREIGN KEY ("offerGroupId", "orderId") REFERENCES "order_offer_groups"("id", "orderId") ON DELETE RESTRICT;
ALTER TABLE "order_price_adjustments" DROP CONSTRAINT "order_price_adjustments_orderItemId_fkey";
ALTER TABLE "order_price_adjustments" DROP CONSTRAINT "order_price_adjustments_orderOfferGroupId_fkey";
ALTER TABLE "order_price_adjustments"
  ADD CONSTRAINT "order_price_adjustments_orderItemId_orderId_fkey" FOREIGN KEY ("orderItemId", "orderId") REFERENCES "order_items"("id", "orderId") ON DELETE RESTRICT,
  ADD CONSTRAINT "order_price_adjustments_orderOfferGroupId_orderId_fkey" FOREIGN KEY ("orderOfferGroupId", "orderId") REFERENCES "order_offer_groups"("id", "orderId") ON DELETE RESTRICT;

ALTER TABLE "store_offers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "store_offer_combos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "store_offer_combo_groups" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "store_offer_combo_choices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "store_offer_product_prices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "store_offer_quantity_prices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "store_offer_bogos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "store_offer_cart_discounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "store_offer_free_deliveries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "store_offer_usages" ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'store_offers', 'store_offer_combos', 'store_offer_combo_groups', 'store_offer_combo_choices',
    'store_offer_product_prices', 'store_offer_quantity_prices', 'store_offer_bogos',
    'store_offer_cart_discounts', 'store_offer_free_deliveries', 'store_offer_usages'
  ] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format('REVOKE ALL ON TABLE %I FROM anon', table_name);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE format('REVOKE ALL ON TABLE %I FROM authenticated', table_name);
    END IF;
  END LOOP;
END $$;

COMMIT;

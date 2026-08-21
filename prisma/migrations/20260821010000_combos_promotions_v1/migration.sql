-- Combos e promoções V1. Expansão aditiva; o servidor continua sendo a fonte de verdade do preço.

CREATE TYPE "OrderOfferType" AS ENUM ('COMBO');
CREATE TYPE "OrderPriceAdjustmentType" AS ENUM ('COMBO', 'PRODUCT_PROMOTION', 'COUPON');

ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'COMBO_CREATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'COMBO_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'COMBO_ARCHIVED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'PRODUCT_PROMOTION_CREATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'PRODUCT_PROMOTION_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'PRODUCT_PROMOTION_ARCHIVED';

ALTER TABLE "store_entitlements"
  ADD COLUMN "combosPromotionsEnabled" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "products_id_tenantId_storeId_key"
  ON "products"("id", "tenantId", "storeId");

CREATE TABLE "store_combos" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenantId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "description" VARCHAR(500),
  "specialPrice" INTEGER NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "version" INTEGER NOT NULL DEFAULT 0,
  "startsOn" DATE,
  "endsOnExclusive" DATE,
  "weekdays" "DayOfWeek"[] NOT NULL DEFAULT ARRAY[]::"DayOfWeek"[],
  "startMinute" INTEGER,
  "endMinuteExclusive" INTEGER,
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "store_combos_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "store_combos_name_check" CHECK (length(btrim("name")) BETWEEN 1 AND 120),
  CONSTRAINT "store_combos_special_price_check" CHECK ("specialPrice" > 0),
  CONSTRAINT "store_combos_version_check" CHECK ("version" >= 0),
  CONSTRAINT "store_combos_date_window_check" CHECK (
    "startsOn" IS NULL OR "endsOnExclusive" IS NULL OR "startsOn" < "endsOnExclusive"
  ),
  CONSTRAINT "store_combos_time_window_check" CHECK (
    ("startMinute" IS NULL AND "endMinuteExclusive" IS NULL)
    OR (
      "startMinute" BETWEEN 0 AND 1439
      AND "endMinuteExclusive" BETWEEN 0 AND 1439
      AND "startMinute" <> "endMinuteExclusive"
    )
  )
);

CREATE TABLE "store_combo_items" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenantId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "comboId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "position" INTEGER NOT NULL DEFAULT 0,

  CONSTRAINT "store_combo_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "store_combo_items_quantity_check" CHECK ("quantity" > 0),
  CONSTRAINT "store_combo_items_position_check" CHECK ("position" >= 0)
);

CREATE TABLE "store_product_promotions" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenantId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "promotionalPrice" INTEGER NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "version" INTEGER NOT NULL DEFAULT 0,
  "startsOn" DATE,
  "endsOnExclusive" DATE,
  "weekdays" "DayOfWeek"[] NOT NULL DEFAULT ARRAY[]::"DayOfWeek"[],
  "startMinute" INTEGER,
  "endMinuteExclusive" INTEGER,
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "store_product_promotions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "store_product_promotions_price_check" CHECK ("promotionalPrice" > 0),
  CONSTRAINT "store_product_promotions_version_check" CHECK ("version" >= 0),
  CONSTRAINT "store_product_promotions_date_window_check" CHECK (
    "startsOn" IS NULL OR "endsOnExclusive" IS NULL OR "startsOn" < "endsOnExclusive"
  ),
  CONSTRAINT "store_product_promotions_time_window_check" CHECK (
    ("startMinute" IS NULL AND "endMinuteExclusive" IS NULL)
    OR (
      "startMinute" BETWEEN 0 AND 1439
      AND "endMinuteExclusive" BETWEEN 0 AND 1439
      AND "startMinute" <> "endMinuteExclusive"
    )
  )
);

CREATE TABLE "order_offer_groups" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenantId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "offerType" "OrderOfferType" NOT NULL,
  "sourceOfferIdSnapshot" TEXT NOT NULL,
  "sourceOfferVersion" INTEGER NOT NULL,
  "nameSnapshot" VARCHAR(120) NOT NULL,
  "quantity" INTEGER NOT NULL,
  "position" INTEGER NOT NULL DEFAULT 0,
  "regularBaseAmount" INTEGER NOT NULL,
  "offerBaseAmount" INTEGER NOT NULL,
  "discountAmount" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "order_offer_groups_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "order_offer_groups_name_check" CHECK (length(btrim("nameSnapshot")) BETWEEN 1 AND 120),
  CONSTRAINT "order_offer_groups_version_check" CHECK ("sourceOfferVersion" >= 0),
  CONSTRAINT "order_offer_groups_quantity_check" CHECK ("quantity" > 0),
  CONSTRAINT "order_offer_groups_amounts_check" CHECK (
    "regularBaseAmount" >= 0
    AND "offerBaseAmount" > 0
    AND "discountAmount" > 0
    AND "offerBaseAmount" + "discountAmount" = "regularBaseAmount"
  )
);

CREATE TABLE "order_price_adjustments" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenantId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "adjustmentType" "OrderPriceAdjustmentType" NOT NULL,
  "sourceIdSnapshot" TEXT,
  "sourceVersion" INTEGER,
  "labelSnapshot" VARCHAR(120) NOT NULL,
  "amount" INTEGER NOT NULL,
  "orderItemId" TEXT,
  "orderOfferGroupId" TEXT,
  "position" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "order_price_adjustments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "order_price_adjustments_label_check" CHECK (length(btrim("labelSnapshot")) BETWEEN 1 AND 120),
  CONSTRAINT "order_price_adjustments_amount_check" CHECK ("amount" > 0),
  CONSTRAINT "order_price_adjustments_version_check" CHECK ("sourceVersion" IS NULL OR "sourceVersion" >= 0),
  CONSTRAINT "order_price_adjustments_position_check" CHECK ("position" >= 0)
);

ALTER TABLE "order_items"
  ADD COLUMN "offerGroupId" TEXT,
  ADD COLUMN "offerComponentPosition" INTEGER;

CREATE UNIQUE INDEX "store_combos_id_tenantId_storeId_key"
  ON "store_combos"("id", "tenantId", "storeId");
CREATE INDEX "store_combos_tenantId_storeId_isActive_archivedAt_sortOrder_idx"
  ON "store_combos"("tenantId", "storeId", "isActive", "archivedAt", "sortOrder");
CREATE INDEX "store_combos_storeId_updatedAt_idx" ON "store_combos"("storeId", "updatedAt");

CREATE UNIQUE INDEX "store_combo_items_comboId_productId_key"
  ON "store_combo_items"("comboId", "productId");
CREATE INDEX "store_combo_items_comboId_position_id_idx"
  ON "store_combo_items"("comboId", "position", "id");
CREATE INDEX "store_combo_items_tenantId_storeId_productId_idx"
  ON "store_combo_items"("tenantId", "storeId", "productId");

CREATE UNIQUE INDEX "store_product_promotions_id_tenantId_storeId_key"
  ON "store_product_promotions"("id", "tenantId", "storeId");
CREATE INDEX "store_product_promotions_tenantId_storeId_productId_isActive_archivedAt_idx"
  ON "store_product_promotions"("tenantId", "storeId", "productId", "isActive", "archivedAt");
CREATE INDEX "store_product_promotions_storeId_updatedAt_idx"
  ON "store_product_promotions"("storeId", "updatedAt");

CREATE UNIQUE INDEX "order_offer_groups_id_tenantId_storeId_key"
  ON "order_offer_groups"("id", "tenantId", "storeId");
CREATE INDEX "order_offer_groups_orderId_position_id_idx"
  ON "order_offer_groups"("orderId", "position", "id");
CREATE INDEX "order_offer_groups_tenantId_storeId_offerType_createdAt_idx"
  ON "order_offer_groups"("tenantId", "storeId", "offerType", "createdAt");

CREATE INDEX "order_price_adjustments_orderId_position_id_idx"
  ON "order_price_adjustments"("orderId", "position", "id");
CREATE INDEX "order_price_adjustments_orderItemId_idx" ON "order_price_adjustments"("orderItemId");
CREATE INDEX "order_price_adjustments_orderOfferGroupId_idx"
  ON "order_price_adjustments"("orderOfferGroupId");
CREATE INDEX "order_price_adjustments_tenantId_storeId_adjustmentType_createdAt_idx"
  ON "order_price_adjustments"("tenantId", "storeId", "adjustmentType", "createdAt");

CREATE INDEX "order_items_offerGroupId_offerComponentPosition_id_idx"
  ON "order_items"("offerGroupId", "offerComponentPosition", "id");

ALTER TABLE "store_combos"
  ADD CONSTRAINT "store_combos_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "store_combos_storeId_tenantId_fkey"
    FOREIGN KEY ("storeId", "tenantId") REFERENCES "stores"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "store_combo_items"
  ADD CONSTRAINT "store_combo_items_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "store_combo_items_storeId_tenantId_fkey"
    FOREIGN KEY ("storeId", "tenantId") REFERENCES "stores"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "store_combo_items_comboId_tenantId_storeId_fkey"
    FOREIGN KEY ("comboId", "tenantId", "storeId") REFERENCES "store_combos"("id", "tenantId", "storeId") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "store_combo_items_productId_tenantId_storeId_fkey"
    FOREIGN KEY ("productId", "tenantId", "storeId") REFERENCES "products"("id", "tenantId", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "store_product_promotions"
  ADD CONSTRAINT "store_product_promotions_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "store_product_promotions_storeId_tenantId_fkey"
    FOREIGN KEY ("storeId", "tenantId") REFERENCES "stores"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "store_product_promotions_productId_tenantId_storeId_fkey"
    FOREIGN KEY ("productId", "tenantId", "storeId") REFERENCES "products"("id", "tenantId", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "order_offer_groups"
  ADD CONSTRAINT "order_offer_groups_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "order_offer_groups_storeId_tenantId_fkey"
    FOREIGN KEY ("storeId", "tenantId") REFERENCES "stores"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "order_offer_groups_orderId_tenantId_storeId_fkey"
    FOREIGN KEY ("orderId", "tenantId", "storeId") REFERENCES "orders"("id", "tenantId", "storeId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "order_price_adjustments"
  ADD CONSTRAINT "order_price_adjustments_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "order_price_adjustments_storeId_tenantId_fkey"
    FOREIGN KEY ("storeId", "tenantId") REFERENCES "stores"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "order_price_adjustments_orderId_tenantId_storeId_fkey"
    FOREIGN KEY ("orderId", "tenantId", "storeId") REFERENCES "orders"("id", "tenantId", "storeId") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "order_price_adjustments_orderItemId_fkey"
    FOREIGN KEY ("orderItemId") REFERENCES "order_items"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "order_price_adjustments_orderOfferGroupId_fkey"
    FOREIGN KEY ("orderOfferGroupId") REFERENCES "order_offer_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "order_items"
  ADD CONSTRAINT "order_items_offerGroupId_fkey"
    FOREIGN KEY ("offerGroupId") REFERENCES "order_offer_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "order_items_offer_component_shape_check" CHECK (
    ("offerGroupId" IS NULL AND "offerComponentPosition" IS NULL)
    OR ("offerGroupId" IS NOT NULL AND "offerComponentPosition" IS NOT NULL AND "offerComponentPosition" >= 0)
  );

ALTER TABLE "store_combos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "store_combo_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "store_product_promotions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "order_offer_groups" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "order_price_adjustments" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE "store_combos" FROM anon;
    REVOKE ALL ON TABLE "store_combo_items" FROM anon;
    REVOKE ALL ON TABLE "store_product_promotions" FROM anon;
    REVOKE ALL ON TABLE "order_offer_groups" FROM anon;
    REVOKE ALL ON TABLE "order_price_adjustments" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "store_combos" FROM authenticated;
    REVOKE ALL ON TABLE "store_combo_items" FROM authenticated;
    REVOKE ALL ON TABLE "store_product_promotions" FROM authenticated;
    REVOKE ALL ON TABLE "order_offer_groups" FROM authenticated;
    REVOKE ALL ON TABLE "order_price_adjustments" FROM authenticated;
  END IF;
END $$;

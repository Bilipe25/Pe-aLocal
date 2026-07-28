-- Checkout v2 foundation.
-- The migration is additive: legacy address/zone fields remain available so
-- the application can be rolled back without losing newly-created orders.

BEGIN;

-- ---------------------------------------------------------------------------
-- Store-scoped coupons
-- ---------------------------------------------------------------------------
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'COUPON_CREATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'COUPON_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'COUPON_DELETED';

ALTER TABLE "coupons" ADD COLUMN "storeId" TEXT;

-- A coupon referenced by banners from exactly one store has deterministic
-- ownership even when its tenant has multiple stores. Legacy banners may
-- store either the coupon UUID or its normalized public code.
WITH "banner_coupon_store" AS (
  SELECT
    c."id" AS "couponId",
    MIN(b."storeId") AS "storeId"
  FROM "coupons" c
  JOIN "store_banners" b
   ON b."tenantId" = c."tenantId"
   AND b."destinationType" = 'COUPON'
   AND (
     b."destinationValue" = c."id"
     OR upper(btrim(b."destinationValue")) = upper(btrim(c."code"))
   )
  GROUP BY c."id"
  HAVING COUNT(DISTINCT b."storeId") = 1
)
UPDATE "coupons" c
SET "storeId" = owned."storeId"
FROM "banner_coupon_store" owned
WHERE c."id" = owned."couponId";

-- A tenant with one store is also deterministic.
WITH "single_store_tenant" AS (
  SELECT "tenantId", MIN("id") AS "storeId"
  FROM "stores"
  GROUP BY "tenantId"
  HAVING COUNT(*) = 1
)
UPDATE "coupons" c
SET "storeId" = owned."storeId"
FROM "single_store_tenant" owned
WHERE c."tenantId" = owned."tenantId"
  AND c."storeId" IS NULL;

-- Ambiguous legacy coupons are never promoted to a store automatically.
UPDATE "coupons"
SET "isActive" = false
WHERE "storeId" IS NULL;

DROP INDEX IF EXISTS "coupons_tenantId_code_key";

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "coupons"
    WHERE "storeId" IS NOT NULL
    GROUP BY "tenantId", "storeId", upper(btrim("code"))
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Checkout v2 preflight failed: case-insensitive duplicate coupon codes exist inside a store'
      USING ERRCODE = '23505';
  END IF;
END $$;

UPDATE "coupons"
SET "code" = upper(btrim("code"));

UPDATE "coupons" coupon
SET "usageCount" = GREATEST(coupon."usageCount", usage_count.total)
FROM (
  SELECT "couponId", COUNT(*)::integer AS total
  FROM "coupon_usages"
  GROUP BY "couponId"
) usage_count
WHERE coupon."id" = usage_count."couponId"
  AND coupon."usageCount" < usage_count.total;

CREATE UNIQUE INDEX "coupons_tenantId_storeId_code_key"
  ON "coupons"("tenantId", "storeId", "code");
CREATE INDEX "coupons_tenantId_storeId_isActive_idx"
  ON "coupons"("tenantId", "storeId", "isActive");

ALTER TABLE "coupons"
  ADD CONSTRAINT "coupons_storeId_tenantId_fkey"
  FOREIGN KEY ("storeId", "tenantId")
  REFERENCES "stores"("id", "tenantId")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "coupon_usages"
    GROUP BY "couponId", "orderId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Checkout v2 preflight failed: duplicate coupon usages exist for the same order'
      USING ERRCODE = '23505';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "coupon_usages" usage
    LEFT JOIN "orders" orders ON orders."id" = usage."orderId"
    WHERE orders."id" IS NULL
  ) THEN
    RAISE EXCEPTION
      'Checkout v2 preflight failed: orphan coupon usages reference missing orders'
      USING ERRCODE = '23503';
  END IF;
END $$;

CREATE UNIQUE INDEX "coupon_usages_couponId_orderId_key"
  ON "coupon_usages"("couponId", "orderId");

ALTER TABLE "coupon_usages"
  ADD CONSTRAINT "coupon_usages_orderId_fkey"
  FOREIGN KEY ("orderId")
  REFERENCES "orders"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE
  NOT VALID;

ALTER TABLE "coupons"
  ADD CONSTRAINT "coupons_active_requires_store_check"
    CHECK ("storeId" IS NOT NULL OR "isActive" = false) NOT VALID;
ALTER TABLE "coupon_usages"
  ADD CONSTRAINT "coupon_usages_discount_check"
    CHECK ("discount" >= 0) NOT VALID;

-- ---------------------------------------------------------------------------
-- Verifiable delivery coverage
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX "delivery_zones_id_tenantId_storeId_key"
  ON "delivery_zones"("id", "tenantId", "storeId");

ALTER TABLE "delivery_zones"
  ADD CONSTRAINT "delivery_zones_storeId_tenantId_fkey"
  FOREIGN KEY ("storeId", "tenantId")
  REFERENCES "stores"("id", "tenantId")
  ON DELETE CASCADE
  ON UPDATE CASCADE
  NOT VALID;

CREATE TABLE "delivery_zone_postal_ranges" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "deliveryZoneId" TEXT NOT NULL,
  "postalCodeStart" CHAR(8) NOT NULL,
  "postalCodeEnd" CHAR(8) NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "delivery_zone_postal_ranges_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "delivery_zone_postal_ranges_postal_codes_check"
    CHECK (
      "postalCodeStart" ~ '^[0-9]{8}$'
      AND "postalCodeEnd" ~ '^[0-9]{8}$'
      AND "postalCodeStart" <= "postalCodeEnd"
    )
);

CREATE INDEX "delivery_zone_postal_ranges_tenantId_storeId_isActive_idx"
  ON "delivery_zone_postal_ranges"("tenantId", "storeId", "isActive");
CREATE INDEX "delivery_zone_postal_ranges_deliveryZoneId_isActive_idx"
  ON "delivery_zone_postal_ranges"("deliveryZoneId", "isActive");
CREATE INDEX "delivery_zone_postal_ranges_storeId_postalCodeStart_postalCodeEnd_idx"
  ON "delivery_zone_postal_ranges"("storeId", "postalCodeStart", "postalCodeEnd");
CREATE UNIQUE INDEX "delivery_zone_postal_ranges_zone_start_end_key"
  ON "delivery_zone_postal_ranges"("deliveryZoneId", "postalCodeStart", "postalCodeEnd");

ALTER TABLE "delivery_zone_postal_ranges"
  ADD CONSTRAINT "delivery_zone_postal_ranges_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "delivery_zone_postal_ranges"
  ADD CONSTRAINT "delivery_zone_postal_ranges_storeId_tenantId_fkey"
  FOREIGN KEY ("storeId", "tenantId") REFERENCES "stores"("id", "tenantId")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "delivery_zone_postal_ranges"
  ADD CONSTRAINT "delivery_zone_postal_ranges_deliveryZoneId_tenantId_storeId_fkey"
  FOREIGN KEY ("deliveryZoneId", "tenantId", "storeId")
  REFERENCES "delivery_zones"("id", "tenantId", "storeId")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Repository checks provide a friendly conflict message. This trigger is the
-- final integrity boundary for seed scripts, maintenance SQL and future code.
CREATE FUNCTION public."_prevent_delivery_postal_range_overlap"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('delivery-coverage:' || NEW."storeId", 0)
  );

  IF NEW."isActive" AND EXISTS (
    SELECT 1
    FROM public."delivery_zone_postal_ranges" existing
    WHERE existing."tenantId" = NEW."tenantId"
      AND existing."storeId" = NEW."storeId"
      AND existing."id" <> NEW."id"
      AND existing."isActive"
      AND existing."postalCodeStart" <= NEW."postalCodeEnd"
      AND existing."postalCodeEnd" >= NEW."postalCodeStart"
  ) THEN
    RAISE EXCEPTION
      'Overlapping delivery postal ranges are not allowed for the same store'
      USING ERRCODE = '23P01';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public."_prevent_delivery_postal_range_overlap"()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER "delivery_zone_postal_ranges_no_overlap"
BEFORE INSERT OR UPDATE OF
  "tenantId", "storeId", "postalCodeStart", "postalCodeEnd", "isActive"
ON "delivery_zone_postal_ranges"
FOR EACH ROW
EXECUTE FUNCTION public."_prevent_delivery_postal_range_overlap"();

ALTER TABLE "delivery_zone_postal_ranges" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "delivery_zone_postal_ranges" FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- Quote, structured delivery snapshot and public tracking retention
-- ---------------------------------------------------------------------------
ALTER TABLE "orders"
  ADD COLUMN "quoteFingerprint" VARCHAR(64),
  ADD COLUMN "publicTokenExpiresAt" TIMESTAMP(3),
  ADD COLUMN "deliveryPostalCode" VARCHAR(8),
  ADD COLUMN "deliveryStreet" VARCHAR(160),
  ADD COLUMN "deliveryNumber" VARCHAR(30),
  ADD COLUMN "deliveryComplement" VARCHAR(120),
  ADD COLUMN "deliveryNeighborhood" VARCHAR(120),
  ADD COLUMN "deliveryCity" VARCHAR(120),
  ADD COLUMN "deliveryState" VARCHAR(2),
  ADD COLUMN "deliveryReference" VARCHAR(200),
  ADD COLUMN "promisedFulfillmentMinAt" TIMESTAMP(3),
  ADD COLUMN "promisedFulfillmentMaxAt" TIMESTAMP(3);

ALTER TABLE "orders"
  ALTER COLUMN "publicTokenExpiresAt" SET DEFAULT (CURRENT_TIMESTAMP + INTERVAL '30 days');

-- ---------------------------------------------------------------------------
-- Defensive monetary and quantity constraints
-- ---------------------------------------------------------------------------
ALTER TABLE "orders"
  ADD CONSTRAINT "orders_public_token_expiry_not_null_check"
    CHECK ("publicTokenExpiresAt" IS NOT NULL) NOT VALID,
  ADD CONSTRAINT "orders_values_nonnegative_check"
    CHECK (
      "subtotal" >= 0
      AND "discount" >= 0
      AND "deliveryFee" >= 0
      AND "total" >= 0
      AND ("changeFor" IS NULL OR "changeFor" >= 0)
    ) NOT VALID,
  ADD CONSTRAINT "orders_discount_within_subtotal_check"
    CHECK ("discount" <= "subtotal") NOT VALID,
  ADD CONSTRAINT "orders_total_consistency_check"
    CHECK (
      "total"::bigint =
      "subtotal"::bigint - "discount"::bigint + "deliveryFee"::bigint
    ) NOT VALID,
  ADD CONSTRAINT "orders_delivery_postal_code_check"
    CHECK (
      "deliveryPostalCode" IS NULL
      OR "deliveryPostalCode" ~ '^[0-9]{8}$'
    ) NOT VALID,
  ADD CONSTRAINT "orders_promised_window_check"
    CHECK (
      (
        "promisedFulfillmentMinAt" IS NULL
        AND "promisedFulfillmentMaxAt" IS NULL
      )
      OR
      (
        "promisedFulfillmentMinAt" IS NOT NULL
        AND "promisedFulfillmentMaxAt" IS NOT NULL
        AND "promisedFulfillmentMinAt" <= "promisedFulfillmentMaxAt"
      )
    ) NOT VALID,
  ADD CONSTRAINT "orders_quote_fingerprint_check"
    CHECK (
      "quoteFingerprint" IS NULL
      OR "quoteFingerprint" ~ '^[0-9a-f]{64}$'
    ) NOT VALID,
  ADD CONSTRAINT "orders_public_token_expiry_check"
    CHECK ("publicTokenExpiresAt" >= "createdAt") NOT VALID,
  ADD CONSTRAINT "orders_structured_delivery_address_check"
    CHECK (
      (
        "deliveryStreet" IS NULL
        AND "deliveryNumber" IS NULL
        AND "deliveryNeighborhood" IS NULL
        AND "deliveryCity" IS NULL
        AND "deliveryState" IS NULL
        AND "deliveryPostalCode" IS NULL
      )
      OR
      (
        char_length(btrim("deliveryStreet")) > 0
        AND char_length(btrim("deliveryNumber")) > 0
        AND char_length(btrim("deliveryNeighborhood")) > 0
        AND char_length(btrim("deliveryCity")) > 0
        AND "deliveryState" ~ '^[A-Z]{2}$'
        AND "deliveryPostalCode" ~ '^[0-9]{8}$'
      )
    ) NOT VALID;

ALTER TABLE "order_items"
  ADD CONSTRAINT "order_items_quantity_check"
    CHECK ("quantity" BETWEEN 1 AND 99) NOT VALID,
  ADD CONSTRAINT "order_items_values_nonnegative_check"
    CHECK ("unitPrice" >= 0 AND "itemTotal" >= 0) NOT VALID,
  ADD CONSTRAINT "order_items_total_consistency_check"
    CHECK (
      "itemTotal"::bigint = "unitPrice"::bigint * "quantity"::bigint
    ) NOT VALID;

ALTER TABLE "order_item_options"
  ADD CONSTRAINT "order_item_options_price_nonnegative_check"
    CHECK ("optionPrice" >= 0) NOT VALID;

ALTER TABLE "delivery_zones"
  ADD CONSTRAINT "delivery_zones_values_nonnegative_check"
    CHECK (
      "fee" >= 0
      AND ("minOrderValue" IS NULL OR "minOrderValue" >= 0)
    ) NOT VALID;

ALTER TABLE "coupons"
  ADD CONSTRAINT "coupons_values_check"
    CHECK (
      "value" > 0
      AND ("type" <> 'PERCENTAGE' OR "value" <= 100)
      AND ("minOrderValue" IS NULL OR "minOrderValue" >= 0)
      AND ("maxDiscount" IS NULL OR "maxDiscount" >= 0)
      AND ("maxUsages" IS NULL OR "maxUsages" > 0)
      AND "usageCount" >= 0
      AND ("maxUsages" IS NULL OR "usageCount" <= "maxUsages")
      AND ("startsAt" IS NULL OR "expiresAt" IS NULL OR "startsAt" < "expiresAt")
      AND "code" = upper(btrim("code"))
      AND char_length("code") > 0
    ) NOT VALID;

COMMIT;

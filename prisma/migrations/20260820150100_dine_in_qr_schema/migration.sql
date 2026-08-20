-- Pedido por QR Code no Salão: schema aditivo e desligado por padrão.

ALTER TABLE "store_entitlements"
  ADD COLUMN "dineInQrEnabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "store_settings"
  ADD COLUMN "acceptsCardInPerson" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "store_dining_tables" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenantId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "label" VARCHAR(80) NOT NULL,
  "labelNormalized" VARCHAR(80) NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "publicToken" VARCHAR(43) NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "version" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "store_dining_tables_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "store_dining_tables_label_check" CHECK (
    length(btrim("label")) BETWEEN 1 AND 80
    AND length(btrim("labelNormalized")) BETWEEN 1 AND 80
  ),
  CONSTRAINT "store_dining_tables_sort_order_check" CHECK ("sortOrder" >= 0),
  CONSTRAINT "store_dining_tables_version_check" CHECK ("version" >= 0),
  CONSTRAINT "store_dining_tables_public_token_check" CHECK (
    "publicToken" ~ '^[A-Za-z0-9_-]{43}$'
  )
);

CREATE UNIQUE INDEX "store_dining_tables_publicToken_key"
  ON "store_dining_tables"("publicToken");
CREATE UNIQUE INDEX "store_dining_tables_id_tenantId_storeId_key"
  ON "store_dining_tables"("id", "tenantId", "storeId");
CREATE UNIQUE INDEX "store_dining_tables_tenantId_storeId_labelNormalized_key"
  ON "store_dining_tables"("tenantId", "storeId", "labelNormalized");
CREATE INDEX "store_dining_tables_tenantId_storeId_isActive_sortOrder_id_idx"
  ON "store_dining_tables"("tenantId", "storeId", "isActive", "sortOrder", "id");

ALTER TABLE "store_dining_tables"
  ADD CONSTRAINT "store_dining_tables_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "store_dining_tables_storeId_tenantId_fkey"
    FOREIGN KEY ("storeId", "tenantId") REFERENCES "stores"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "orders"
  ALTER COLUMN "customerPhone" DROP NOT NULL,
  ADD COLUMN "diningTableId" TEXT,
  ADD COLUMN "diningTableLabelSnapshot" VARCHAR(80);

CREATE INDEX "orders_diningTableId_idx" ON "orders"("diningTableId");
CREATE INDEX "orders_tenantId_storeId_diningTableId_createdAt_id_idx"
  ON "orders"("tenantId", "storeId", "diningTableId", "createdAt", "id");

ALTER TABLE "orders"
  ADD CONSTRAINT "orders_diningTableId_tenantId_storeId_fkey"
    FOREIGN KEY ("diningTableId", "tenantId", "storeId")
    REFERENCES "store_dining_tables"("id", "tenantId", "storeId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "orders_dine_in_shape_check" CHECK (
    (
      "modality" = 'DINE_IN'
      AND "diningTableId" IS NOT NULL
      AND "diningTableLabelSnapshot" IS NOT NULL
      AND length(btrim("diningTableLabelSnapshot")) BETWEEN 1 AND 80
      AND "customerPhone" IS NULL
      AND "customerPhoneNormalized" IS NULL
      AND "deliveryAddress" IS NULL
      AND "deliveryZoneName" IS NULL
      AND "deliveryPostalCode" IS NULL
      AND "deliveryStreet" IS NULL
      AND "deliveryNumber" IS NULL
      AND "deliveryComplement" IS NULL
      AND "deliveryNeighborhood" IS NULL
      AND "deliveryCity" IS NULL
      AND "deliveryState" IS NULL
      AND "deliveryReference" IS NULL
      AND "deliveryFee" = 0
      AND "changeFor" IS NULL
      AND "paymentMethod" IN ('PIX', 'CASH', 'CARD_IN_PERSON')
      AND "status" <> 'OUT_FOR_DELIVERY'
      AND ("status" <> 'DELIVERED' OR "paymentStatus" = 'PAID')
    )
    OR
    (
      "modality" <> 'DINE_IN'
      AND "diningTableId" IS NULL
      AND "diningTableLabelSnapshot" IS NULL
      AND "customerPhone" IS NOT NULL
      AND "paymentMethod" <> 'CARD_IN_PERSON'
    )
  );

ALTER TABLE "store_dining_tables" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE "store_dining_tables" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "store_dining_tables" FROM authenticated;
  END IF;
END $$;

-- O recurso permanece inativo em todas as lojas até habilitação explícita do entitlement.

-- O canal do pedido é independente da modalidade. A coluna permanece
-- nullable para não atribuir uma origem fictícia aos pedidos legados.
CREATE TYPE "OrderOrigin" AS ENUM ('STOREFRONT', 'DINE_IN_QR', 'POS');

ALTER TABLE "store_entitlements"
ADD COLUMN "posEnabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "orders"
ADD COLUMN "origin" "OrderOrigin",
ADD COLUMN "createdById" TEXT,
ALTER COLUMN "customerName" DROP NOT NULL;

ALTER TABLE "orders"
ADD CONSTRAINT "orders_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "orders_storeId_origin_createdAt_id_idx"
ON "orders"("storeId", "origin", "createdAt", "id");

CREATE INDEX "orders_createdById_createdAt_idx"
ON "orders"("createdById", "createdAt");

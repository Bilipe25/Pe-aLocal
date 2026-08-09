-- Snapshot aditivo da imagem exibida no momento da compra.
--
-- Rollback operacional: a versão anterior da aplicação ignora estas colunas.
-- Rollback físico (somente após confirmar que o histórico não depende delas):
--   DROP INDEX IF EXISTS "order_items_imageAssetId_idx";
--   ALTER TABLE "order_items" DROP COLUMN "imageAssetId", DROP COLUMN "imageUrl";

ALTER TABLE "order_items"
  ADD COLUMN "imageUrl" TEXT,
  ADD COLUMN "imageAssetId" TEXT;

UPDATE "order_items" AS item
SET
  "imageUrl" = product."imageUrl",
  "imageAssetId" = product."imageAssetId"
FROM "orders" AS orders,
     "products" AS product
WHERE orders."id" = item."orderId"
  AND product."id" = item."productId"
  AND product."tenantId" = orders."tenantId"
  AND product."storeId" = orders."storeId"
  AND (item."imageUrl" IS NULL OR item."imageAssetId" IS NULL);

CREATE INDEX "order_items_imageAssetId_idx"
  ON "order_items"("imageAssetId");

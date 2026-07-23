-- Garante que imagens de produto pertençam ao mesmo tenant e à mesma loja.
-- A migration falha sem alterar dados caso encontre uma referência inválida.
--
-- Rollback:
--   ALTER TABLE "products" DROP CONSTRAINT IF EXISTS "products_image_asset_scope_fkey";
--   DROP INDEX IF EXISTS "products_imageAssetId_tenantId_storeId_idx";

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "products" product
    LEFT JOIN "store_assets" asset
      ON asset."id" = product."imageAssetId"
     AND asset."tenantId" = product."tenantId"
     AND asset."storeId" = product."storeId"
    WHERE product."imageAssetId" IS NOT NULL
      AND (
        asset."id" IS NULL
        OR asset."assetType" <> 'PRODUCT_IMAGE'::"StoreAssetType"
      )
  ) THEN
    RAISE EXCEPTION
      'Existem produtos com imageAssetId ausente, de outra loja ou de tipo diferente de PRODUCT_IMAGE.';
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS "products_imageAssetId_tenantId_storeId_idx"
  ON "products"("imageAssetId", "tenantId", "storeId");

ALTER TABLE "products"
  ADD CONSTRAINT "products_image_asset_scope_fkey"
  FOREIGN KEY ("imageAssetId", "tenantId", "storeId")
  REFERENCES "store_assets"("id", "tenantId", "storeId")
  ON DELETE RESTRICT
  ON UPDATE CASCADE
  NOT VALID;

ALTER TABLE "products"
  VALIDATE CONSTRAINT "products_image_asset_scope_fkey";

-- Assets white-label por loja. O bucket R2 permanece externo ao banco e não
-- é criado por esta migration.

ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'ASSET_UPLOADED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'ASSET_REPLACED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'ASSET_DELETED';

CREATE TYPE "StoreAssetType" AS ENUM (
  'LOGO', 'LOGO_DARK', 'COVER', 'FAVICON', 'SOCIAL_IMAGE', 'BANNER'
);
CREATE TYPE "StoreAssetStatus" AS ENUM ('ACTIVE', 'DELETED');

CREATE TABLE "store_assets" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "assetType" "StoreAssetType" NOT NULL,
  "objectKey" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "width" INTEGER NOT NULL,
  "height" INTEGER NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "altText" TEXT NOT NULL,
  "status" "StoreAssetStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),

  CONSTRAINT "store_assets_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "store_assets_mime_type_check" CHECK (
    "mimeType" IN ('image/png', 'image/jpeg', 'image/webp', 'image/avif')
  ),
  CONSTRAINT "store_assets_dimensions_check" CHECK (
    "width" BETWEEN 1 AND 8000 AND "height" BETWEEN 1 AND 8000
  ),
  CONSTRAINT "store_assets_size_check" CHECK (
    CASE "assetType"
      WHEN 'FAVICON' THEN "sizeBytes" BETWEEN 1 AND 524288
      WHEN 'LOGO' THEN "sizeBytes" BETWEEN 1 AND 2097152
      WHEN 'LOGO_DARK' THEN "sizeBytes" BETWEEN 1 AND 2097152
      WHEN 'SOCIAL_IMAGE' THEN "sizeBytes" BETWEEN 1 AND 3145728
      ELSE "sizeBytes" BETWEEN 1 AND 5242880
    END
  ),
  CONSTRAINT "store_assets_alt_text_check" CHECK (char_length("altText") <= 300),
  CONSTRAINT "store_assets_object_key_check" CHECK (
    char_length("objectKey") BETWEEN 20 AND 500
    AND "objectKey" LIKE 'tenants/%/stores/%'
    AND position('..' IN "objectKey") = 0
  ),
  CONSTRAINT "store_assets_deletion_state_check" CHECK (
    ("status" = 'ACTIVE' AND "deletedAt" IS NULL)
    OR ("status" = 'DELETED' AND "deletedAt" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "store_assets_objectKey_key" ON "store_assets"("objectKey");
CREATE UNIQUE INDEX "store_assets_id_tenantId_storeId_key"
  ON "store_assets"("id", "tenantId", "storeId");
CREATE INDEX "store_assets_tenantId_storeId_status_createdAt_idx"
  ON "store_assets"("tenantId", "storeId", "status", "createdAt");
CREATE INDEX "store_assets_storeId_assetType_status_idx"
  ON "store_assets"("storeId", "assetType", "status");
CREATE INDEX "store_assets_createdById_idx" ON "store_assets"("createdById");
CREATE INDEX "store_assets_deletedAt_idx" ON "store_assets"("deletedAt");
CREATE INDEX "store_assets_active_store_type_idx"
  ON "store_assets"("storeId", "assetType", "createdAt" DESC)
  WHERE "status" = 'ACTIVE' AND "deletedAt" IS NULL;

ALTER TABLE "store_assets"
  ADD CONSTRAINT "store_assets_storeId_tenantId_fkey"
  FOREIGN KEY ("storeId", "tenantId")
  REFERENCES "stores"("id", "tenantId")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "store_assets"
  ADD CONSTRAINT "store_assets_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- A aplicação acessa os assets somente no servidor via Prisma + Hyperdrive.
ALTER TABLE "store_assets" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "store_assets" FROM anon, authenticated;

-- Rollback controlado:
-- 1. Desative uploads e mantenha a rota de leitura enquanto exporta objectKey.
-- 2. Exporte store_assets e preserve os objetos no R2.
-- 3. DROP TABLE "store_assets";
-- 4. DROP TYPE "StoreAssetStatus";
-- 5. DROP TYPE "StoreAssetType";
-- Os valores adicionados a AuditAction devem permanecer; removê-los exige
-- recriar o enum e reescrever audit_logs.

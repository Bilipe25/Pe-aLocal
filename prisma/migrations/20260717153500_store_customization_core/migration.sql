-- Núcleo white-label por loja. Não remove nem modifica os campos legados.
-- A aplicação continuará usando logoUrl, coverUrl e StoreSettings como fallback
-- até a conclusão e validação da fase de renderização em staging.

ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'CUSTOMIZATION_DRAFT_SAVED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'CUSTOMIZATION_DRAFT_DISCARDED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'CUSTOMIZATION_PUBLISHED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'CUSTOMIZATION_REVISION_RESTORED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'CUSTOMIZATION_DEFAULT_RESTORED';

CREATE TYPE "CustomizationRevisionAction" AS ENUM ('PUBLISHED');
CREATE TYPE "CustomizationRevisionOrigin" AS ENUM (
  'SUPER_ADMIN_UI',
  'RESTORE',
  'MIGRATION',
  'SYSTEM_DEFAULT'
);

-- Permite FKs compostas que comprovam a relação tenant/loja no banco.
CREATE UNIQUE INDEX "stores_id_tenantId_key" ON "stores"("id", "tenantId");

CREATE TABLE "store_customizations" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "schemaVersion" INTEGER NOT NULL DEFAULT 1,
  "publishedConfig" JSONB NOT NULL,
  "draftConfig" JSONB,
  "draftVersion" INTEGER NOT NULL DEFAULT 0,
  "publishedVersion" INTEGER NOT NULL DEFAULT 0,
  "publishedAt" TIMESTAMP(3),
  "publishedById" TEXT,
  "updatedById" TEXT,
  "draftOrigin" "CustomizationRevisionOrigin",
  "draftSourceRevisionId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "store_customizations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "store_customizations_schema_version_check" CHECK ("schemaVersion" = 1),
  CONSTRAINT "store_customizations_draft_version_check" CHECK ("draftVersion" >= 0),
  CONSTRAINT "store_customizations_published_version_check" CHECK ("publishedVersion" >= 0),
  CONSTRAINT "store_customizations_published_object_check" CHECK (
    jsonb_typeof("publishedConfig") = 'object'
  ),
  CONSTRAINT "store_customizations_draft_object_check" CHECK (
    "draftConfig" IS NULL OR jsonb_typeof("draftConfig") = 'object'
  ),
  CONSTRAINT "store_customizations_published_size_check" CHECK (
    octet_length("publishedConfig"::text) <= 65536
  ),
  CONSTRAINT "store_customizations_draft_size_check" CHECK (
    "draftConfig" IS NULL OR octet_length("draftConfig"::text) <= 65536
  )
);

CREATE TABLE "store_customization_revisions" (
  "id" TEXT NOT NULL,
  "customizationId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "schemaVersion" INTEGER NOT NULL DEFAULT 1,
  "snapshot" JSONB NOT NULL,
  "actorUserId" TEXT,
  "action" "CustomizationRevisionAction" NOT NULL DEFAULT 'PUBLISHED',
  "reason" TEXT NOT NULL,
  "origin" "CustomizationRevisionOrigin" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "publishedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "store_customization_revisions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "store_customization_revisions_version_check" CHECK ("version" > 0),
  CONSTRAINT "store_customization_revisions_schema_version_check" CHECK ("schemaVersion" = 1),
  CONSTRAINT "store_customization_revisions_snapshot_object_check" CHECK (
    jsonb_typeof("snapshot") = 'object'
  ),
  CONSTRAINT "store_customization_revisions_snapshot_size_check" CHECK (
    octet_length("snapshot"::text) <= 65536
  ),
  CONSTRAINT "store_customization_revisions_reason_check" CHECK (
    char_length("reason") BETWEEN 3 AND 500
  )
);

ALTER TABLE "audit_logs" ADD COLUMN "storeId" TEXT;

CREATE UNIQUE INDEX "store_customizations_storeId_key"
  ON "store_customizations"("storeId");
CREATE UNIQUE INDEX "store_customizations_id_tenantId_storeId_key"
  ON "store_customizations"("id", "tenantId", "storeId");
CREATE UNIQUE INDEX "store_customizations_storeId_tenantId_key"
  ON "store_customizations"("storeId", "tenantId");
CREATE INDEX "store_customizations_tenantId_idx"
  ON "store_customizations"("tenantId");
CREATE INDEX "store_customizations_publishedById_idx"
  ON "store_customizations"("publishedById");
CREATE INDEX "store_customizations_updatedById_idx"
  ON "store_customizations"("updatedById");
CREATE INDEX "store_customizations_draftSourceRevisionId_idx"
  ON "store_customizations"("draftSourceRevisionId");

CREATE UNIQUE INDEX "store_customization_revisions_storeId_version_key"
  ON "store_customization_revisions"("storeId", "version");
CREATE INDEX "store_customization_revisions_customizationId_idx"
  ON "store_customization_revisions"("customizationId");
CREATE INDEX "store_customization_revisions_tenantId_storeId_idx"
  ON "store_customization_revisions"("tenantId", "storeId");
CREATE INDEX "store_customization_revisions_actorUserId_idx"
  ON "store_customization_revisions"("actorUserId");
CREATE INDEX "store_customization_revisions_storeId_createdAt_id_idx"
  ON "store_customization_revisions"("storeId", "createdAt", "id");
CREATE INDEX "audit_logs_storeId_idx" ON "audit_logs"("storeId");

ALTER TABLE "store_customizations"
  ADD CONSTRAINT "store_customizations_storeId_tenantId_fkey"
  FOREIGN KEY ("storeId", "tenantId")
  REFERENCES "stores"("id", "tenantId")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "store_customizations"
  ADD CONSTRAINT "store_customizations_publishedById_fkey"
  FOREIGN KEY ("publishedById") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "store_customizations"
  ADD CONSTRAINT "store_customizations_updatedById_fkey"
  FOREIGN KEY ("updatedById") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "store_customization_revisions"
  ADD CONSTRAINT "store_customization_revisions_customizationId_tenantId_storeId_fkey"
  FOREIGN KEY ("customizationId", "tenantId", "storeId")
  REFERENCES "store_customizations"("id", "tenantId", "storeId")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "store_customization_revisions"
  ADD CONSTRAINT "store_customization_revisions_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "audit_logs"
  ADD CONSTRAINT "audit_logs_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "stores"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill não destrutivo e repetível para lojas já existentes.
INSERT INTO "store_customizations" (
  "id", "tenantId", "storeId", "schemaVersion", "publishedConfig",
  "draftVersion", "publishedVersion", "publishedAt", "draftOrigin",
  "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  store."tenantId",
  store."id",
  1,
  jsonb_build_object(
    'schemaVersion', 1,
    'identity', jsonb_build_object(
      'slogan', '', 'shortDescription', '', 'aboutText', '',
      'logoAssetId', NULL, 'logoDarkAssetId', NULL, 'coverAssetId', NULL,
      'faviconAssetId', NULL, 'socialImageAssetId', NULL
    ),
    'palette', jsonb_build_object(
      'primary', CASE
        WHEN settings."primaryColor" ~ '^#[0-9A-Fa-f]{6}$' THEN upper(settings."primaryColor")
        ELSE '#D9480F'
      END,
      'secondary', CASE
        WHEN settings."secondaryColor" ~ '^#[0-9A-Fa-f]{6}$' THEN upper(settings."secondaryColor")
        ELSE '#241C15'
      END,
      'accent', '#F59E0B', 'background', '#FFFDF9', 'surface', '#FFFFFF',
      'text', '#241C15', 'mutedText', '#6B625A', 'border', '#DED7CE',
      'buttonBackground', '#C2410C', 'buttonText', '#FFFFFF'
    ),
    'typography', jsonb_build_object(
      'headingFontKey', CASE
        WHEN lower(coalesce(settings."fontFamily", '')) LIKE '%bricolage%' THEN 'bricolage'
        ELSE 'inter'
      END,
      'bodyFontKey', 'inter', 'baseSize', 'medium', 'headingWeight', 'bold',
      'buttonStyle', 'solid', 'borderRadius', 'medium'
    ),
    'theme', jsonb_build_object('layoutTemplate', 'CLASSIC_LIST', 'visualPreset', 'CLASSIC'),
    'layout', jsonb_build_object(
      'showCover', true, 'showSlogan', true, 'showSearch', true,
      'showFeaturedProducts', true, 'showCategoryDescription', false,
      'showProductImages', true, 'showProductBadges', true,
      'categoryNavigation', 'HORIZONTAL_STICKY', 'productPresentation', 'LIST',
      'cartPresentation', 'FLOATING',
      'sectionOrder', jsonb_build_array(
        'HEADER', 'BANNERS', 'FEATURED', 'CATEGORIES', 'CATALOG', 'STORE_INFO'
      )
    ),
    'seo', jsonb_build_object(
      'title', '', 'description', '', 'canonicalUrl', NULL, 'indexable', true
    ),
    'platformBranding', jsonb_build_object('showPedidoLocalBranding', true)
  ),
  0,
  1,
  CURRENT_TIMESTAMP,
  NULL,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "stores" AS store
LEFT JOIN "store_settings" AS settings ON settings."storeId" = store."id"
ON CONFLICT ("storeId") DO NOTHING;

-- Toda configuração migrada começa com uma revisão publicada imutável.
INSERT INTO "store_customization_revisions" (
  "id", "customizationId", "tenantId", "storeId", "version",
  "schemaVersion", "snapshot", "actorUserId", "action", "reason",
  "origin", "createdAt", "publishedAt"
)
SELECT
  gen_random_uuid()::text,
  customization."id",
  customization."tenantId",
  customization."storeId",
  1,
  customization."schemaVersion",
  customization."publishedConfig",
  NULL,
  'PUBLISHED',
  'Migração inicial das configurações legadas.',
  'MIGRATION',
  customization."publishedAt",
  customization."publishedAt"
FROM "store_customizations" AS customization
WHERE customization."publishedVersion" = 1
  AND NOT EXISTS (
    SELECT 1
    FROM "store_customization_revisions" AS revision
    WHERE revision."storeId" = customization."storeId"
      AND revision."version" = 1
  );

-- Defesa em profundidade para o schema public do Supabase.
ALTER TABLE "store_customizations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "store_customization_revisions" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "store_customizations" FROM anon, authenticated;
REVOKE ALL ON TABLE "store_customization_revisions" FROM anon, authenticated;

-- Rollback controlado:
-- 1. Volte o código para o fallback legado antes de remover as tabelas.
-- 2. Exporte store_customizations e store_customization_revisions.
-- 3. DROP TABLE "store_customization_revisions";
-- 4. DROP TABLE "store_customizations";
-- 5. ALTER TABLE "audit_logs" DROP COLUMN "storeId";
-- 6. DROP TYPE "CustomizationRevisionAction";
-- 7. DROP TYPE "CustomizationRevisionOrigin";
-- 8. DROP INDEX "stores_id_tenantId_key";
-- Os valores adicionados a AuditAction devem ser mantidos no rollback; removê-los
-- exige recriar o enum e reescrever a coluna, aumentando desnecessariamente o risco.

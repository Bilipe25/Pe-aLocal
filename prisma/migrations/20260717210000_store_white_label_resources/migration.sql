-- Recursos adicionais de white-label por loja: banners, domínios manuais e
-- entitlements. Esta migration não cria recursos Cloudflare nem altera DNS.

ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'BANNER_CREATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'BANNER_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'BANNER_DELETED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'DOMAIN_REQUESTED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'DOMAIN_STATUS_CHANGED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'ENTITLEMENT_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'BRANDING_VISIBILITY_CHANGED';

CREATE TYPE "BannerDestinationType" AS ENUM (
  'NONE', 'CATEGORY', 'PRODUCT', 'COUPON', 'INTERNAL_PATH'
);
CREATE TYPE "StoreDomainType" AS ENUM ('SUBDOMAIN', 'CUSTOM');
CREATE TYPE "StoreDomainStatus" AS ENUM (
  'PENDING', 'VERIFYING', 'ACTIVE', 'FAILED', 'DISABLED'
);

CREATE TABLE "store_banners" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "assetId" TEXT,
  "title" TEXT NOT NULL,
  "subtitle" TEXT,
  "buttonText" TEXT,
  "destinationType" "BannerDestinationType" NOT NULL DEFAULT 'NONE',
  "destinationValue" TEXT,
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "isActive" BOOLEAN NOT NULL DEFAULT false,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "store_banners_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "store_banners_text_check" CHECK (
    char_length("title") BETWEEN 1 AND 120
    AND ("subtitle" IS NULL OR char_length("subtitle") <= 240)
    AND ("buttonText" IS NULL OR char_length("buttonText") BETWEEN 1 AND 80)
  ),
  CONSTRAINT "store_banners_priority_check" CHECK ("priority" BETWEEN 0 AND 1000),
  CONSTRAINT "store_banners_period_check" CHECK (
    "startsAt" IS NULL OR "endsAt" IS NULL OR "endsAt" > "startsAt"
  ),
  CONSTRAINT "store_banners_destination_check" CHECK (
    ("destinationType" = 'NONE' AND "destinationValue" IS NULL)
    OR ("destinationType" <> 'NONE' AND "destinationValue" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "store_banners_id_tenantId_storeId_key"
  ON "store_banners"("id", "tenantId", "storeId");
CREATE INDEX "store_banners_tenantId_storeId_isActive_priority_idx"
  ON "store_banners"("tenantId", "storeId", "isActive", "priority");
CREATE INDEX "store_banners_storeId_startsAt_endsAt_idx"
  ON "store_banners"("storeId", "startsAt", "endsAt");
CREATE INDEX "store_banners_assetId_idx" ON "store_banners"("assetId");
CREATE INDEX "store_banners_public_active_idx"
  ON "store_banners"("storeId", "priority" DESC, "startsAt", "endsAt")
  WHERE "isActive" = true;

ALTER TABLE "store_banners"
  ADD CONSTRAINT "store_banners_storeId_tenantId_fkey"
  FOREIGN KEY ("storeId", "tenantId")
  REFERENCES "stores"("id", "tenantId")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "store_banners"
  ADD CONSTRAINT "store_banners_assetId_tenantId_storeId_fkey"
  FOREIGN KEY ("assetId", "tenantId", "storeId")
  REFERENCES "store_assets"("id", "tenantId", "storeId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "store_domains" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "hostname" TEXT NOT NULL,
  "domainType" "StoreDomainType" NOT NULL,
  "status" "StoreDomainStatus" NOT NULL DEFAULT 'PENDING',
  "verificationToken" TEXT NOT NULL,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "verifiedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "store_domains_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "store_domains_hostname_check" CHECK (
    char_length("hostname") BETWEEN 4 AND 253
    AND "hostname" = lower("hostname")
    AND position(':' IN "hostname") = 0
    AND position('/' IN "hostname") = 0
    AND position(chr(92) IN "hostname") = 0
    AND "hostname" NOT LIKE '.%'
    AND "hostname" NOT LIKE '%.'
  ),
  CONSTRAINT "store_domains_verification_token_check" CHECK (
    char_length("verificationToken") BETWEEN 16 AND 128
  ),
  CONSTRAINT "store_domains_active_state_check" CHECK (
    ("status" = 'ACTIVE' AND "verifiedAt" IS NOT NULL)
    OR ("status" <> 'ACTIVE' AND "isPrimary" = false)
  )
);

CREATE UNIQUE INDEX "store_domains_hostname_key" ON "store_domains"("hostname");
CREATE UNIQUE INDEX "store_domains_verificationToken_key"
  ON "store_domains"("verificationToken");
CREATE UNIQUE INDEX "store_domains_id_tenantId_storeId_key"
  ON "store_domains"("id", "tenantId", "storeId");
CREATE INDEX "store_domains_tenantId_storeId_status_idx"
  ON "store_domains"("tenantId", "storeId", "status");
CREATE INDEX "store_domains_storeId_isPrimary_idx"
  ON "store_domains"("storeId", "isPrimary");
CREATE UNIQUE INDEX "store_domains_one_primary_active_idx"
  ON "store_domains"("storeId")
  WHERE "isPrimary" = true AND "status" = 'ACTIVE';

ALTER TABLE "store_domains"
  ADD CONSTRAINT "store_domains_storeId_tenantId_fkey"
  FOREIGN KEY ("storeId", "tenantId")
  REFERENCES "stores"("id", "tenantId")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "store_entitlements" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "maxAssetCount" INTEGER NOT NULL DEFAULT 25,
  "maxAssetStorageBytes" INTEGER NOT NULL DEFAULT 52428800,
  "maxBanners" INTEGER NOT NULL DEFAULT 5,
  "allowedLayoutTemplates" TEXT[] NOT NULL DEFAULT ARRAY[
    'CLASSIC_LIST', 'MODERN_GRID', 'EDITORIAL_HERO'
  ]::TEXT[],
  "allowedVisualPresets" TEXT[] NOT NULL DEFAULT ARRAY[
    'CLASSIC', 'MODERN', 'MINIMALIST', 'BURGER', 'PIZZA', 'ACAI_DESSERT',
    'EXECUTIVE_RESTAURANT', 'DARK_PREMIUM'
  ]::TEXT[],
  "advancedTypographyEnabled" BOOLEAN NOT NULL DEFAULT true,
  "customDomainEnabled" BOOLEAN NOT NULL DEFAULT false,
  "platformBrandingRemovalEnabled" BOOLEAN NOT NULL DEFAULT false,
  "scheduledBannersEnabled" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "store_entitlements_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "store_entitlements_limits_check" CHECK (
    "maxAssetCount" BETWEEN 1 AND 1000
    AND "maxAssetStorageBytes" BETWEEN 1048576 AND 1073741824
    AND "maxBanners" BETWEEN 0 AND 100
  ),
  CONSTRAINT "store_entitlements_layouts_check" CHECK (
    cardinality("allowedLayoutTemplates") BETWEEN 1 AND 3
    AND "allowedLayoutTemplates" <@ ARRAY[
      'CLASSIC_LIST', 'MODERN_GRID', 'EDITORIAL_HERO'
    ]::TEXT[]
  ),
  CONSTRAINT "store_entitlements_presets_check" CHECK (
    cardinality("allowedVisualPresets") BETWEEN 1 AND 8
    AND "allowedVisualPresets" <@ ARRAY[
      'CLASSIC', 'MODERN', 'MINIMALIST', 'BURGER', 'PIZZA', 'ACAI_DESSERT',
      'EXECUTIVE_RESTAURANT', 'DARK_PREMIUM'
    ]::TEXT[]
  )
);

CREATE UNIQUE INDEX "store_entitlements_storeId_key" ON "store_entitlements"("storeId");
CREATE UNIQUE INDEX "store_entitlements_id_tenantId_storeId_key"
  ON "store_entitlements"("id", "tenantId", "storeId");
CREATE UNIQUE INDEX "store_entitlements_storeId_tenantId_key"
  ON "store_entitlements"("storeId", "tenantId");
CREATE INDEX "store_entitlements_tenantId_storeId_idx"
  ON "store_entitlements"("tenantId", "storeId");

ALTER TABLE "store_entitlements"
  ADD CONSTRAINT "store_entitlements_storeId_tenantId_fkey"
  FOREIGN KEY ("storeId", "tenantId")
  REFERENCES "stores"("id", "tenantId")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Defaults permissivos para recursos já existentes; nenhuma configuração
-- publicada é alterada pelo backfill.
INSERT INTO "store_entitlements" (
  "id", "tenantId", "storeId", "updatedAt"
)
SELECT gen_random_uuid()::text, store."tenantId", store."id", CURRENT_TIMESTAMP
FROM "stores" store
ON CONFLICT ("storeId") DO NOTHING;

-- A aplicação acessa estas tabelas somente no servidor por Prisma/Hyperdrive.
ALTER TABLE "store_banners" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "store_domains" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "store_entitlements" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "store_banners" FROM anon, authenticated;
REVOKE ALL ON TABLE "store_domains" FROM anon, authenticated;
REVOKE ALL ON TABLE "store_entitlements" FROM anon, authenticated;

-- Rollback controlado:
-- 1. Exporte store_banners, store_domains e store_entitlements.
-- 2. Reative a marca PedidoLocal nas configurações antes de remover entitlements.
-- 3. Remova referências de banners aos assets, se necessário.
-- 4. DROP TABLE "store_banners";
-- 5. DROP TABLE "store_domains";
-- 6. DROP TABLE "store_entitlements";
-- 7. DROP TYPE "BannerDestinationType";
-- 8. DROP TYPE "StoreDomainType";
-- 9. DROP TYPE "StoreDomainStatus";
-- Os valores de AuditAction permanecem para preservar audit_logs existentes.

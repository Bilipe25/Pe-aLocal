-- Fase 7: historico de slugs publicos por loja.
-- O redirect aponta direto para a loja atual e nao cria cadeia de redirects.
CREATE TABLE "store_slug_redirects" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "oldSlug" TEXT NOT NULL,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "store_slug_redirects_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "store_slug_redirects_oldSlug_format_check" CHECK (
    "oldSlug" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    AND char_length("oldSlug") BETWEEN 3 AND 60
  )
);

CREATE UNIQUE INDEX "store_slug_redirects_oldSlug_key"
  ON "store_slug_redirects"("oldSlug");
CREATE INDEX "store_slug_redirects_tenantId_storeId_createdAt_idx"
  ON "store_slug_redirects"("tenantId", "storeId", "createdAt");
CREATE INDEX "store_slug_redirects_createdById_idx"
  ON "store_slug_redirects"("createdById");

ALTER TABLE "store_slug_redirects"
  ADD CONSTRAINT "store_slug_redirects_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "store_slug_redirects"
  ADD CONSTRAINT "store_slug_redirects_storeId_tenantId_fkey"
  FOREIGN KEY ("storeId", "tenantId")
  REFERENCES "stores"("id", "tenantId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "store_slug_redirects"
  ADD CONSTRAINT "store_slug_redirects_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- A aplicacao acessa redirects somente no servidor via Prisma + Hyperdrive.
ALTER TABLE "store_slug_redirects" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "store_slug_redirects" FROM anon, authenticated;

-- Rollback manual seguro:
-- 1. Exporte store_slug_redirects para preservar links antigos.
-- 2. Publique uma versao da aplicacao que nao dependa mais do historico.
-- 3. DROP TABLE "store_slug_redirects";

-- Aceita configurações e revisões históricas v1 enquanto todos os novos
-- registros passam a usar v2. O JSON histórico não é reescrito.
ALTER TABLE "store_customizations"
  ALTER COLUMN "schemaVersion" SET DEFAULT 2,
  DROP CONSTRAINT "store_customizations_schema_version_check",
  ADD CONSTRAINT "store_customizations_schema_version_check"
    CHECK ("schemaVersion" IN (1, 2));

ALTER TABLE "store_customization_revisions"
  ALTER COLUMN "schemaVersion" SET DEFAULT 2,
  DROP CONSTRAINT "store_customization_revisions_schema_version_check",
  ADD CONSTRAINT "store_customization_revisions_schema_version_check"
    CHECK ("schemaVersion" IN (1, 2));

-- CATEGORY_IMAGE possui limite próprio de 2 MB e formato aproximadamente
-- quadrado. Os limites existentes dos demais tipos são preservados.
ALTER TABLE "store_assets"
  DROP CONSTRAINT "store_assets_size_check",
  ADD CONSTRAINT "store_assets_size_check" CHECK (
    CASE "assetType"
      WHEN 'FAVICON' THEN "sizeBytes" BETWEEN 1 AND 524288
      WHEN 'LOGO' THEN "sizeBytes" BETWEEN 1 AND 2097152
      WHEN 'LOGO_DARK' THEN "sizeBytes" BETWEEN 1 AND 2097152
      WHEN 'CATEGORY_IMAGE' THEN "sizeBytes" BETWEEN 1 AND 2097152
      WHEN 'SOCIAL_IMAGE' THEN "sizeBytes" BETWEEN 1 AND 3145728
      ELSE "sizeBytes" BETWEEN 1 AND 5242880
    END
  ),
  DROP CONSTRAINT "store_assets_dimensions_check",
  ADD CONSTRAINT "store_assets_dimensions_check" CHECK (
    "width" BETWEEN 1 AND 8000
    AND "height" BETWEEN 1 AND 8000
    AND (
      "assetType" <> 'CATEGORY_IMAGE'
      OR (
        "width" >= 320
        AND "height" >= 320
        AND "width"::numeric / "height"::numeric BETWEEN 0.8 AND 1.25
      )
    )
  ),
  DROP CONSTRAINT "store_assets_alt_text_check",
  ADD CONSTRAINT "store_assets_alt_text_check" CHECK (
    char_length("altText") <= 300
    AND (
      "assetType" <> 'CATEGORY_IMAGE'
      OR (
        char_length(btrim("altText")) BETWEEN 1 AND 300
        AND "altText" !~ '[<>]'
      )
    )
  );

-- Não há backfill: v1 é migrado em memória e só vira v2 ao salvar/restaurar
-- um draft ou publicar novamente.
--
-- Rollback operacional:
-- 1. desative o editor/renderização de imagens de categoria;
-- 2. mantenha v1/v2 e CATEGORY_IMAGE para preservar histórico;
-- 3. volte os defaults para 1 somente se o código antigo voltar a escrever;
-- 4. restaure os constraints originais apenas depois de converter e validar
--    todos os registros v2 e exportar os assets CATEGORY_IMAGE.

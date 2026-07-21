-- Fase 6: prazo operacional estruturado. O campo textual permanece durante
-- a transição para manter compatibilidade com versões anteriores.
ALTER TABLE "store_settings"
ADD COLUMN "estimatedTimeMinMinutes" INTEGER,
ADD COLUMN "estimatedTimeMaxMinutes" INTEGER;

-- Extrai somente o formato legado simples "30-50 min". Qualquer texto livre
-- fora desse contrato recebe o default documentado de 30 a 50 minutos.
UPDATE "store_settings"
SET
  "estimatedTimeMinMinutes" = CASE
    WHEN "estimatedTime" ~ '^\s*[0-9]{1,4}\s*[-–]\s*[0-9]{1,4}'
      THEN LEAST(GREATEST((regexp_match("estimatedTime", '^\s*([0-9]{1,4})'))[1]::INTEGER, 1), 1440)
    ELSE 30
  END,
  "estimatedTimeMaxMinutes" = CASE
    WHEN "estimatedTime" ~ '^\s*[0-9]{1,4}\s*[-–]\s*[0-9]{1,4}'
      THEN LEAST(GREATEST((regexp_match("estimatedTime", '[-–]\s*([0-9]{1,4})'))[1]::INTEGER, 1), 1440)
    ELSE 50
  END;

-- Corrige dados legados invertidos sem descartar o valor mais conservador.
UPDATE "store_settings"
SET "estimatedTimeMaxMinutes" = "estimatedTimeMinMinutes"
WHERE "estimatedTimeMaxMinutes" < "estimatedTimeMinMinutes";

ALTER TABLE "store_settings"
ALTER COLUMN "estimatedTimeMinMinutes" SET DEFAULT 30,
ALTER COLUMN "estimatedTimeMinMinutes" SET NOT NULL,
ALTER COLUMN "estimatedTimeMaxMinutes" SET DEFAULT 50,
ALTER COLUMN "estimatedTimeMaxMinutes" SET NOT NULL,
ADD CONSTRAINT "store_settings_estimated_time_range_check" CHECK (
  "estimatedTimeMinMinutes" BETWEEN 1 AND 1440
  AND "estimatedTimeMaxMinutes" BETWEEN "estimatedTimeMinMinutes" AND 1440
);

-- Rollback manual seguro: o campo estimatedTime continuou sendo atualizado.
-- ALTER TABLE "store_settings"
--   DROP CONSTRAINT "store_settings_estimated_time_range_check",
--   DROP COLUMN "estimatedTimeMinMinutes",
--   DROP COLUMN "estimatedTimeMaxMinutes";

ALTER TABLE "store_settings"
  ADD COLUMN "showEstimatedTimeInHero" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "showFulfillmentInHero" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "showMinOrderValueInHero" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "showOpeningHoursInHero" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "showFullAddressInStoreInfo" BOOLEAN NOT NULL DEFAULT false;

ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'STOREFRONT_DISPLAY_UPDATED';

-- Rollback:
-- ALTER TABLE "store_settings"
--   DROP COLUMN "showEstimatedTimeInHero",
--   DROP COLUMN "showFulfillmentInHero",
--   DROP COLUMN "showMinOrderValueInHero",
--   DROP COLUMN "showOpeningHoursInHero",
--   DROP COLUMN "showFullAddressInStoreInfo";
--
-- PostgreSQL não remove um valor de enum diretamente. Para rollback completo,
-- recrie "AuditAction" sem STOREFRONT_DISPLAY_UPDATED somente depois de confirmar
-- que nenhum registro em "audit_logs" usa esse valor.

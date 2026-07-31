-- Rollback destrutivo opcional. Não executar enquanto a aplicação nova estiver ativa.
ALTER TABLE "store_settings"
  DROP COLUMN IF EXISTS "showRecentPurchasesSection",
  DROP COLUMN IF EXISTS "showFeaturedProductsSection";

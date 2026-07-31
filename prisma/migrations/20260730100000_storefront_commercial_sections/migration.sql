-- Vitrines comerciais controladas pelo estabelecimento.
-- Os defaults preservam Destaques e só permitem Recentes quando o dispositivo
-- possuir um reconhecimento válido, resolvido exclusivamente no servidor.
ALTER TABLE "store_settings"
  ADD COLUMN "showRecentPurchasesSection" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "showFeaturedProductsSection" BOOLEAN NOT NULL DEFAULT true;

-- Rollback operacional recomendado: publicar a versão anterior da aplicação e
-- preservar estas colunas aditivas. Para remoção física, use rollback.sql
-- somente depois de confirmar que nenhuma versão ativa depende destes campos.

-- Token monotônico usado para controle de concorrência otimista nas
-- configurações da loja. O default faz o backfill das linhas existentes.
ALTER TABLE "stores"
ADD COLUMN "configurationVersion" INTEGER NOT NULL DEFAULT 0;

-- Rollback manual (exige interromper temporariamente as escritas de
-- configuração para não misturar clientes com e sem controle de versão):
-- ALTER TABLE "stores" DROP COLUMN "configurationVersion";

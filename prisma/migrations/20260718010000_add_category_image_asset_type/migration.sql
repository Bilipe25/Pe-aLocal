-- O valor é adicionado isoladamente para ser confirmado antes de aparecer em
-- constraints posteriores. Nenhum objeto R2 é criado ou alterado.
ALTER TYPE "StoreAssetType" ADD VALUE IF NOT EXISTS 'CATEGORY_IMAGE';

-- Rollback seguro: mantenha o valor inativo no enum. Remover valores de enum
-- exige recriar o tipo e reescrever a coluna, o que não é apropriado para um
-- rollback operacional.

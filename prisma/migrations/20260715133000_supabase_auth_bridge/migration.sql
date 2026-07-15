-- Migração ponte, reversível e não destrutiva.
-- Os hashes e sessões legados são preservados até a validação completa em staging.
ALTER TABLE "users" ADD COLUMN "authUserId" TEXT;
ALTER TABLE "users" ALTER COLUMN "passwordHash" DROP NOT NULL;

CREATE UNIQUE INDEX "users_authUserId_key" ON "users"("authUserId");

-- Rollback manual antes de associar identidades:
-- DROP INDEX "users_authUserId_key";
-- ALTER TABLE "users" DROP COLUMN "authUserId";
-- ALTER TABLE "users" ALTER COLUMN "passwordHash" SET NOT NULL;

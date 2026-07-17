-- Separa autorização da plataforma da autorização restrita a tenants.
-- A migration é intencionalmente deny-by-default: usuários existentes recebem USER.
CREATE TYPE "PlatformRole" AS ENUM ('USER', 'SUPER_ADMIN');
CREATE TYPE "TenantRole" AS ENUM ('OWNER', 'MANAGER', 'ATTENDANT');

ALTER TABLE "users"
ADD COLUMN "platformRole" "PlatformRole" NOT NULL DEFAULT 'USER';

-- Nunca converta SUPER_ADMIN em um papel de tenant. Se houver dado legado
-- inconsistente, interrompa a migration para revisão manual.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "tenant_members"
    WHERE "role"::text = 'SUPER_ADMIN'
  ) THEN
    RAISE EXCEPTION
      'tenant_members contém SUPER_ADMIN; corrija os dados antes da migration';
  END IF;
END $$;

ALTER TABLE "tenant_members"
ALTER COLUMN "role" TYPE "TenantRole"
USING ("role"::text::"TenantRole");

DROP TYPE "Role";

-- O administrador de staging é promovido exclusivamente por prisma/seed.ts.
-- Esta migration nunca promove usuários por e-mail em produção.

-- Rollback manual (exporte platformRole antes, pois a coluna será removida):
-- CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'OWNER', 'MANAGER', 'ATTENDANT');
-- ALTER TABLE "tenant_members"
--   ALTER COLUMN "role" TYPE "Role"
--   USING ("role"::text::"Role");
-- ALTER TABLE "users" DROP COLUMN "platformRole";
-- DROP TYPE "TenantRole";
-- DROP TYPE "PlatformRole";

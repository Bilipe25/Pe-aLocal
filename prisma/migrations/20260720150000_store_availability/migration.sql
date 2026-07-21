-- Fase 5: fuso por loja e exceções de calendário.
-- O default faz o backfill das lojas existentes sem depender do fuso do
-- navegador ou do processo que executa a migration.
ALTER TABLE "stores"
ADD COLUMN "timeZone" TEXT NOT NULL DEFAULT 'America/Fortaleza';

CREATE TYPE "StoreScheduleExceptionType" AS ENUM ('CLOSED', 'CUSTOM_HOURS');

CREATE TABLE "store_schedule_exceptions" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "type" "StoreScheduleExceptionType" NOT NULL,
  "openTime" TEXT,
  "closeTime" TEXT,
  "reason" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "store_schedule_exceptions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "store_schedule_exceptions_date_range_check" CHECK (
    "date" >= DATE '2000-01-01' AND "date" <= DATE '2100-12-31'
  ),
  CONSTRAINT "store_schedule_exceptions_reason_check" CHECK (
    "reason" IS NULL OR char_length("reason") <= 200
  ),
  CONSTRAINT "store_schedule_exceptions_hours_check" CHECK (
    (
      "type" = 'CLOSED'
      AND "openTime" IS NULL
      AND "closeTime" IS NULL
    )
    OR
    (
      "type" = 'CUSTOM_HOURS'
      AND "openTime" ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'
      AND "closeTime" ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'
      AND "openTime" <> "closeTime"
    )
  )
);

CREATE UNIQUE INDEX "store_schedule_exceptions_storeId_date_key"
  ON "store_schedule_exceptions"("storeId", "date");
CREATE INDEX "store_schedule_exceptions_tenantId_storeId_date_idx"
  ON "store_schedule_exceptions"("tenantId", "storeId", "date");
CREATE INDEX "store_schedule_exceptions_createdById_idx"
  ON "store_schedule_exceptions"("createdById");

ALTER TABLE "store_schedule_exceptions"
  ADD CONSTRAINT "store_schedule_exceptions_storeId_tenantId_fkey"
  FOREIGN KEY ("storeId", "tenantId")
  REFERENCES "stores"("id", "tenantId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "store_schedule_exceptions"
  ADD CONSTRAINT "store_schedule_exceptions_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "store_schedule_exceptions"
  ADD CONSTRAINT "store_schedule_exceptions_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- A aplicação usa Prisma no servidor. A nova tabela permanece fechada para a
-- Data API, seguindo a defesa em profundidade das demais tabelas privadas.
ALTER TABLE "store_schedule_exceptions" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "store_schedule_exceptions" FROM anon, authenticated;

-- Rollback manual (requer backup das exceções e janela sem escritas):
-- DROP TABLE "store_schedule_exceptions";
-- DROP TYPE "StoreScheduleExceptionType";
-- ALTER TABLE "stores" DROP COLUMN "timeZone";

-- V2 — Gestão da mesa. Migration aditiva; Order continua sendo a fonte de verdade.

CREATE TYPE "DiningTableSessionStatus" AS ENUM ('OPEN', 'CLOSED');
CREATE TYPE "DiningTableServiceRequestType" AS ENUM ('ASSISTANCE', 'BILL');
CREATE TYPE "DiningTableServiceRequestStatus" AS ENUM ('OPEN', 'RESOLVED');

ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'DINING_SESSION_OPENED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'DINING_SESSION_CLOSED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'DINING_SESSION_TRANSFERRED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'DINING_SERVICE_REQUEST_RESOLVED';

CREATE TABLE "dining_table_sessions" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenantId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "diningTableId" TEXT NOT NULL,
  "publicToken" VARCHAR(43) NOT NULL,
  "status" "DiningTableSessionStatus" NOT NULL DEFAULT 'OPEN',
  "version" INTEGER NOT NULL DEFAULT 0,
  "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastOrderAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closedAt" TIMESTAMP(3),
  "closedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "dining_table_sessions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "dining_table_sessions_public_token_check" CHECK ("publicToken" ~ '^[A-Za-z0-9_-]{43}$'),
  CONSTRAINT "dining_table_sessions_version_check" CHECK ("version" >= 0),
  CONSTRAINT "dining_table_sessions_dates_check" CHECK (
    ("status" = 'OPEN' AND "closedAt" IS NULL AND "closedById" IS NULL)
    OR ("status" = 'CLOSED' AND "closedAt" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "dining_table_sessions_publicToken_key"
  ON "dining_table_sessions"("publicToken");
CREATE UNIQUE INDEX "dining_table_sessions_id_tenantId_storeId_key"
  ON "dining_table_sessions"("id", "tenantId", "storeId");
CREATE UNIQUE INDEX "dining_table_sessions_one_open_per_table"
  ON "dining_table_sessions"("tenantId", "storeId", "diningTableId")
  WHERE "status" = 'OPEN';
CREATE INDEX "dining_table_sessions_tenantId_storeId_status_openedAt_id_idx"
  ON "dining_table_sessions"("tenantId", "storeId", "status", "openedAt", "id");
CREATE INDEX "dining_table_sessions_tenantId_storeId_diningTableId_status_idx"
  ON "dining_table_sessions"("tenantId", "storeId", "diningTableId", "status");
CREATE INDEX "dining_table_sessions_closedById_idx"
  ON "dining_table_sessions"("closedById");

CREATE TABLE "dining_table_service_requests" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenantId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "diningTableSessionId" TEXT NOT NULL,
  "type" "DiningTableServiceRequestType" NOT NULL,
  "status" "DiningTableServiceRequestStatus" NOT NULL DEFAULT 'OPEN',
  "idempotencyKey" VARCHAR(80) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  "resolvedById" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "dining_table_service_requests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "dining_table_service_requests_idempotency_key_check" CHECK (
    length(btrim("idempotencyKey")) BETWEEN 16 AND 80
  ),
  CONSTRAINT "dining_table_service_requests_version_check" CHECK ("version" >= 0),
  CONSTRAINT "dining_table_service_requests_resolution_check" CHECK (
    ("status" = 'OPEN' AND "resolvedAt" IS NULL AND "resolvedById" IS NULL)
    OR ("status" = 'RESOLVED' AND "resolvedAt" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "dining_table_service_requests_id_tenantId_storeId_key"
  ON "dining_table_service_requests"("id", "tenantId", "storeId");
CREATE UNIQUE INDEX "dining_table_service_requests_session_idempotency_key"
  ON "dining_table_service_requests"("diningTableSessionId", "idempotencyKey");
CREATE UNIQUE INDEX "dining_table_service_requests_one_open_per_type"
  ON "dining_table_service_requests"("diningTableSessionId", "type")
  WHERE "status" = 'OPEN';
CREATE INDEX "dining_table_service_requests_tenantId_storeId_status_createdAt_id_idx"
  ON "dining_table_service_requests"("tenantId", "storeId", "status", "createdAt", "id");
CREATE INDEX "dining_table_service_requests_session_status_createdAt_id_idx"
  ON "dining_table_service_requests"("diningTableSessionId", "status", "createdAt", "id");
CREATE INDEX "dining_table_service_requests_resolvedById_idx"
  ON "dining_table_service_requests"("resolvedById");

ALTER TABLE "orders"
  ADD COLUMN "diningTableSessionId" TEXT;

CREATE INDEX "orders_diningTableSessionId_idx" ON "orders"("diningTableSessionId");
CREATE INDEX "orders_tenantId_storeId_diningTableSessionId_createdAt_id_idx"
  ON "orders"("tenantId", "storeId", "diningTableSessionId", "createdAt", "id");

ALTER TABLE "dining_table_sessions"
  ADD CONSTRAINT "dining_table_sessions_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "dining_table_sessions_storeId_tenantId_fkey"
    FOREIGN KEY ("storeId", "tenantId") REFERENCES "stores"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "dining_table_sessions_diningTableId_tenantId_storeId_fkey"
    FOREIGN KEY ("diningTableId", "tenantId", "storeId")
    REFERENCES "store_dining_tables"("id", "tenantId", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "dining_table_sessions_closedById_fkey"
    FOREIGN KEY ("closedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "dining_table_service_requests"
  ADD CONSTRAINT "dining_table_service_requests_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "dining_table_service_requests_storeId_tenantId_fkey"
    FOREIGN KEY ("storeId", "tenantId") REFERENCES "stores"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "dining_table_service_requests_session_tenant_store_fkey"
    FOREIGN KEY ("diningTableSessionId", "tenantId", "storeId")
    REFERENCES "dining_table_sessions"("id", "tenantId", "storeId") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "dining_table_service_requests_resolvedById_fkey"
    FOREIGN KEY ("resolvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "orders"
  ADD CONSTRAINT "orders_diningTableSessionId_tenantId_storeId_fkey"
    FOREIGN KEY ("diningTableSessionId", "tenantId", "storeId")
    REFERENCES "dining_table_sessions"("id", "tenantId", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "orders_dining_table_session_shape_check" CHECK (
    ("modality" = 'DINE_IN') OR "diningTableSessionId" IS NULL
  );

ALTER TABLE "dining_table_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dining_table_service_requests" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE "dining_table_sessions" FROM anon;
    REVOKE ALL ON TABLE "dining_table_service_requests" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "dining_table_sessions" FROM authenticated;
    REVOKE ALL ON TABLE "dining_table_service_requests" FROM authenticated;
  END IF;
END $$;

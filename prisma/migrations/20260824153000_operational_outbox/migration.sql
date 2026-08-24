BEGIN;

SET LOCAL lock_timeout = '5s';

CREATE TYPE "OperationalOutboxEventType" AS ENUM (
  'DINING_REQUEST_OPENED',
  'DINING_REQUEST_RESOLVED',
  'DINING_SESSION_TRANSFERRED',
  'DINING_SESSION_CLOSED'
);

CREATE TABLE public."operational_outbox_events" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "aggregateType" VARCHAR(40) NOT NULL,
  "aggregateId" TEXT NOT NULL,
  "eventType" "OperationalOutboxEventType" NOT NULL,
  "aggregateVersion" INTEGER NOT NULL,
  "schemaVersion" INTEGER NOT NULL DEFAULT 1,
  "payload" JSONB NOT NULL,
  "status" "OrderOutboxStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "queuedAt" TIMESTAMP(3),
  "lockedAt" TIMESTAMP(3),
  "lockToken" UUID,
  "processedAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "lastError" VARCHAR(1000),
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "operational_outbox_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "operational_outbox_events_attempts_check" CHECK ("attempts" >= 0),
  CONSTRAINT "operational_outbox_events_schemaVersion_check" CHECK ("schemaVersion" > 0),
  CONSTRAINT "operational_outbox_events_aggregateVersion_check" CHECK ("aggregateVersion" >= 0),
  CONSTRAINT "operational_outbox_events_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "operational_outbox_events_storeId_tenantId_fkey"
    FOREIGN KEY ("storeId", "tenantId") REFERENCES "stores"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "operational_outbox_events_aggregateType_aggregateId_eventType_aggregateVersion_key"
  ON "operational_outbox_events"("aggregateType", "aggregateId", "eventType", "aggregateVersion");
CREATE INDEX "operational_outbox_events_status_availableAt_createdAt_idx"
  ON "operational_outbox_events"("status", "availableAt", "createdAt");
CREATE INDEX "operational_outbox_events_storeId_createdAt_id_idx"
  ON "operational_outbox_events"("storeId", "createdAt", "id");
CREATE INDEX "operational_outbox_events_aggregateType_aggregateId_createdAt_idx"
  ON "operational_outbox_events"("aggregateType", "aggregateId", "createdAt");
CREATE INDEX "operational_outbox_events_queuedAt_processedAt_idx"
  ON "operational_outbox_events"("queuedAt", "processedAt");

ALTER TABLE public."operational_outbox_events" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public."operational_outbox_events" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public."operational_outbox_events" FROM authenticated;
  END IF;
END $$;

COMMIT;

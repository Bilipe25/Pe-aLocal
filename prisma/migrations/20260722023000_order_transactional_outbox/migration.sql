BEGIN;

SET LOCAL lock_timeout = '5s';

CREATE TYPE "OrderOutboxStatus" AS ENUM (
  'PENDING',
  'PROCESSING',
  'PROCESSED',
  'FAILED'
);

CREATE TYPE "OrderOutboxEventType" AS ENUM (
  'ORDER_CREATED',
  'ORDER_ACCEPTED',
  'ORDER_PREPARING',
  'ORDER_READY',
  'ORDER_DISPATCHED',
  'ORDER_COMPLETED',
  'ORDER_CANCELLED',
  'ORDER_TRANSITION_UNDONE',
  'PAYMENT_UPDATED'
);

CREATE UNIQUE INDEX "orders_id_tenantId_storeId_key"
  ON public.orders(id, "tenantId", "storeId");

CREATE TABLE public.order_outbox_events (
  id TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "auditLogId" TEXT,
  "eventType" "OrderOutboxEventType" NOT NULL,
  "aggregateVersion" INTEGER NOT NULL,
  "schemaVersion" INTEGER NOT NULL DEFAULT 1,
  payload JSONB NOT NULL,
  status "OrderOutboxStatus" NOT NULL DEFAULT 'PENDING',
  attempts INTEGER NOT NULL DEFAULT 0,
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
  CONSTRAINT "order_outbox_events_pkey" PRIMARY KEY (id),
  CONSTRAINT "order_outbox_events_attempts_check" CHECK (attempts >= 0),
  CONSTRAINT "order_outbox_events_schemaVersion_check" CHECK ("schemaVersion" > 0),
  CONSTRAINT "order_outbox_events_aggregateVersion_check" CHECK ("aggregateVersion" >= 0),
  CONSTRAINT "order_outbox_events_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES public.tenants(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "order_outbox_events_storeId_tenantId_fkey"
    FOREIGN KEY ("storeId", "tenantId")
    REFERENCES public.stores(id, "tenantId") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "order_outbox_events_orderId_tenantId_storeId_fkey"
    FOREIGN KEY ("orderId", "tenantId", "storeId")
    REFERENCES public.orders(id, "tenantId", "storeId") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "order_outbox_events_auditLogId_fkey"
    FOREIGN KEY ("auditLogId") REFERENCES public.audit_logs(id) ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "order_outbox_events_auditLogId_key"
  ON public.order_outbox_events("auditLogId");
CREATE UNIQUE INDEX "order_outbox_events_orderId_eventType_aggregateVersion_key"
  ON public.order_outbox_events("orderId", "eventType", "aggregateVersion");
CREATE INDEX "order_outbox_events_status_availableAt_createdAt_idx"
  ON public.order_outbox_events(status, "availableAt", "createdAt");
CREATE INDEX "order_outbox_events_storeId_createdAt_id_idx"
  ON public.order_outbox_events("storeId", "createdAt", id);
CREATE INDEX "order_outbox_events_orderId_createdAt_id_idx"
  ON public.order_outbox_events("orderId", "createdAt", id);
CREATE INDEX "order_outbox_events_queuedAt_processedAt_idx"
  ON public.order_outbox_events("queuedAt", "processedAt");

ALTER TABLE public.order_outbox_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public.order_outbox_events FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public.order_outbox_events FROM authenticated;
  END IF;
END $$;

COMMIT;

-- Rollback somente após desativar producer, relay e consumer e confirmar backlog zero:
-- DROP TABLE public.order_outbox_events;
-- DROP INDEX public."orders_id_tenantId_storeId_key";
-- DROP TYPE "OrderOutboxEventType";
-- DROP TYPE "OrderOutboxStatus";

-- Expand the audit vocabulary without removing legacy actions.
BEGIN;

ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'ORDER_CREATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'ORDER_ACCEPTED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'ORDER_PREPARATION_STARTED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'ORDER_READY';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'ORDER_DISPATCHED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'ORDER_COMPLETED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'ORDER_CANCELLED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'ORDER_TRANSITION_UNDONE';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'PAYMENT_REPORTED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'PAYMENT_FAILED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'PAYMENT_CANCELLED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'PAYMENT_REFUNDED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'ORDER_INTERNAL_NOTE_ADDED';

COMMIT;

-- New enum values can only be used after the transaction that creates them commits.
BEGIN;

ALTER TABLE "order_status_history"
  ADD COLUMN "versionFrom" INTEGER,
  ADD COLUMN "versionTo" INTEGER;

CREATE INDEX "audit_logs_tenantId_createdAt_id_idx"
  ON "audit_logs"("tenantId", "createdAt", "id");
CREATE INDEX "audit_logs_storeId_createdAt_id_idx"
  ON "audit_logs"("storeId", "createdAt", "id");
CREATE INDEX "audit_logs_entity_entityId_createdAt_id_idx"
  ON "audit_logs"("entity", "entityId", "createdAt", "id");

-- Preserve traceability for orders created before atomic order auditing was deployed.
INSERT INTO "audit_logs" (
  "id",
  "tenantId",
  "storeId",
  "userId",
  "action",
  "entity",
  "entityId",
  "metadata",
  "createdAt"
)
SELECT
  'order-created-backfill-' || orders."id",
  orders."tenantId",
  orders."storeId",
  NULL,
  'ORDER_CREATED',
  'Order',
  orders."id",
  jsonb_build_object(
    'source', 'SYSTEM',
    'backfilled', true,
    'orderNumber', orders."orderNumber",
    'previousStatus', NULL,
    'nextStatus', 'PENDING',
    'previousVersion', NULL,
    'nextVersion', 0
  ),
  orders."createdAt"
FROM "orders" AS orders
WHERE NOT EXISTS (
  SELECT 1
  FROM "audit_logs" AS audit
  WHERE audit."action" = 'ORDER_CREATED'
    AND audit."entity" = 'Order'
    AND audit."entityId" = orders."id"
)
ON CONFLICT ("id") DO NOTHING;

COMMIT;

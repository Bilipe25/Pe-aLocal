-- Additive Phase 8 schema for private operational notes.
-- Rollback plan:
--   1. deploy code that no longer reads/writes order_internal_notes;
--   2. archive the table if retention is required;
--   3. DROP TABLE "order_internal_notes".
-- The enum value is intentionally retained on rollback because PostgreSQL enum
-- value removal is destructive and unused values are backward-compatible.

ALTER TYPE "OrderOutboxEventType"
  ADD VALUE IF NOT EXISTS 'ORDER_INTERNAL_NOTE_ADDED';

BEGIN;

CREATE TABLE "order_internal_notes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "authorUserId" TEXT NOT NULL,
  "body" VARCHAR(1000) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" TIMESTAMP(3),

  CONSTRAINT "order_internal_notes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "order_internal_notes_order_scope_fkey"
    FOREIGN KEY ("orderId", "tenantId", "storeId")
    REFERENCES "orders"("id", "tenantId", "storeId")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "order_internal_notes_authorUserId_fkey"
    FOREIGN KEY ("authorUserId") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "order_internal_notes_orderId_createdAt_id_idx"
  ON "order_internal_notes"("orderId", "createdAt", "id");
CREATE INDEX "order_internal_notes_tenantId_storeId_createdAt_id_idx"
  ON "order_internal_notes"("tenantId", "storeId", "createdAt", "id");

COMMIT;

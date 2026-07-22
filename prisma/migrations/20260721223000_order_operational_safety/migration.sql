-- Additive operational-safety fields. Legacy columns remain available for rollback.
BEGIN;

CREATE TYPE "OrderChangeSource" AS ENUM ('CUSTOMER', 'DASHBOARD', 'SYSTEM', 'WEBHOOK', 'SUPPORT', 'QUEUE');

CREATE TYPE "OrderCancellationReasonCode" AS ENUM (
  'CUSTOMER_REQUEST',
  'PRODUCT_UNAVAILABLE',
  'STORE_UNABLE_TO_FULFILL',
  'ADDRESS_PROBLEM',
  'PAYMENT_NOT_IDENTIFIED',
  'DUPLICATE_ORDER',
  'FRAUD_SUSPECTED',
  'OTHER'
);

ALTER TABLE "orders"
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "statusChangedAt" TIMESTAMP(3),
  ADD COLUMN "acceptedAt" TIMESTAMP(3),
  ADD COLUMN "preparingAt" TIMESTAMP(3),
  ADD COLUMN "readyAt" TIMESTAMP(3),
  ADD COLUMN "dispatchedAt" TIMESTAMP(3),
  ADD COLUMN "deliveredAt" TIMESTAMP(3),
  ADD COLUMN "cancelledAt" TIMESTAMP(3),
  ADD COLUMN "cancelledById" TEXT,
  ADD COLUMN "cancellationReasonCode" "OrderCancellationReasonCode",
  ADD COLUMN "cancellationNote" VARCHAR(500),
  ADD COLUMN "cancellationSource" "OrderChangeSource",
  ADD COLUMN "customerCancellationNoticeRequired" BOOLEAN;

ALTER TABLE "order_status_history"
  ADD COLUMN "changedById" TEXT,
  ADD COLUMN "actorNameSnapshot" TEXT,
  ADD COLUMN "source" "OrderChangeSource" NOT NULL DEFAULT 'SYSTEM',
  ADD COLUMN "reasonCode" "OrderCancellationReasonCode",
  ADD COLUMN "isUndo" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "revertsHistoryId" TEXT;

UPDATE "order_status_history" AS history
SET
  "changedById" = users."id",
  "actorNameSnapshot" = users."name",
  "source" = 'DASHBOARD'
FROM "users" AS users
WHERE history."changedBy" = users."id";

UPDATE "order_status_history"
SET
  "actorNameSnapshot" = 'Sistema',
  "source" = 'SYSTEM'
WHERE "changedBy" = 'system';

UPDATE "order_status_history"
SET
  "actorNameSnapshot" = 'Cliente',
  "source" = 'CUSTOMER'
WHERE "fromStatus" IS NULL
  AND "toStatus" = 'PENDING'
  AND "changedBy" = 'system';

-- Modelo A: pagamento e operação são independentes. Preserve a mudança no histórico.
INSERT INTO "order_status_history" (
  "id",
  "orderId",
  "fromStatus",
  "toStatus",
  "note",
  "changedBy",
  "actorNameSnapshot",
  "source",
  "createdAt"
)
SELECT
  'model-a-awaiting-payment-' || orders."id",
  orders."id",
  'AWAITING_PAYMENT',
  'PENDING',
  'Estado operacional normalizado durante a adoção do Modelo A',
  'system',
  'Sistema',
  'SYSTEM',
  CURRENT_TIMESTAMP
FROM "orders" AS orders
WHERE orders."status" = 'AWAITING_PAYMENT'
ON CONFLICT ("id") DO NOTHING;

UPDATE "orders"
SET "status" = 'PENDING'
WHERE "status" = 'AWAITING_PAYMENT';

UPDATE "orders" AS orders
SET
  "statusChangedAt" = COALESCE((
    SELECT MAX(history."createdAt")
    FROM "order_status_history" AS history
    WHERE history."orderId" = orders."id"
  ), orders."createdAt"),
  "acceptedAt" = (
    SELECT MIN(history."createdAt")
    FROM "order_status_history" AS history
    WHERE history."orderId" = orders."id" AND history."toStatus" = 'CONFIRMED'
  ),
  "preparingAt" = (
    SELECT MIN(history."createdAt")
    FROM "order_status_history" AS history
    WHERE history."orderId" = orders."id" AND history."toStatus" = 'PREPARING'
  ),
  "readyAt" = (
    SELECT MIN(history."createdAt")
    FROM "order_status_history" AS history
    WHERE history."orderId" = orders."id" AND history."toStatus" = 'READY'
  ),
  "dispatchedAt" = (
    SELECT MIN(history."createdAt")
    FROM "order_status_history" AS history
    WHERE history."orderId" = orders."id" AND history."toStatus" = 'OUT_FOR_DELIVERY'
  ),
  "deliveredAt" = (
    SELECT MIN(history."createdAt")
    FROM "order_status_history" AS history
    WHERE history."orderId" = orders."id" AND history."toStatus" = 'DELIVERED'
  ),
  "cancelledAt" = (
    SELECT MIN(history."createdAt")
    FROM "order_status_history" AS history
    WHERE history."orderId" = orders."id" AND history."toStatus" = 'CANCELLED'
  );

ALTER TABLE "orders"
  ALTER COLUMN "statusChangedAt" SET NOT NULL,
  ALTER COLUMN "statusChangedAt" SET DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX "order_status_history_revertsHistoryId_key"
  ON "order_status_history"("revertsHistoryId");
CREATE INDEX "order_status_history_orderId_createdAt_idx"
  ON "order_status_history"("orderId", "createdAt");
CREATE INDEX "order_status_history_changedById_createdAt_idx"
  ON "order_status_history"("changedById", "createdAt");

ALTER TABLE "orders"
  ADD CONSTRAINT "orders_cancelledById_fkey"
  FOREIGN KEY ("cancelledById") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "order_status_history"
  ADD CONSTRAINT "order_status_history_changedById_fkey"
  FOREIGN KEY ("changedById") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;

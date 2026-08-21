-- PDV V2: fundação operacional aditiva e compatível com a V1.
-- Drafts permanecem fora do domínio Order e nunca consomem numeração/pagamento.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

CREATE TYPE "PosDraftStatus" AS ENUM ('OPEN', 'CONVERTED', 'DISCARDED', 'EXPIRED');
CREATE TYPE "PosManualDiscountMode" AS ENUM ('FIXED', 'PERCENTAGE');
CREATE TYPE "PosManualDiscountReasonCode" AS ENUM ('COURTESY', 'SERVICE_RECOVERY', 'NEGOTIATED', 'OTHER');

ALTER TYPE "OrderPriceAdjustmentType" ADD VALUE IF NOT EXISTS 'MANUAL_DISCOUNT';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'POS_MANUAL_DISCOUNT_APPLIED';

CREATE TABLE "store_pos_terminals" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenantId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "name" VARCHAR(80) NOT NULL,
  "nameNormalized" VARCHAR(80) NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "version" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "store_pos_terminals_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "store_pos_terminals_name_check" CHECK (length(btrim("name")) BETWEEN 1 AND 80),
  CONSTRAINT "store_pos_terminals_name_normalized_check" CHECK (length(btrim("nameNormalized")) BETWEEN 1 AND 80),
  CONSTRAINT "store_pos_terminals_version_check" CHECK ("version" >= 0),
  CONSTRAINT "store_pos_terminals_store_name_key" UNIQUE ("storeId", "nameNormalized")
);

CREATE TABLE "store_pos_shortcuts" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenantId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "productId" TEXT,
  "offerId" TEXT,
  "position" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "store_pos_shortcuts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "store_pos_shortcuts_target_check" CHECK (num_nonnulls("productId", "offerId") = 1),
  CONSTRAINT "store_pos_shortcuts_position_check" CHECK ("position" >= 0),
  CONSTRAINT "store_pos_shortcuts_store_position_key" UNIQUE ("storeId", "position")
);

CREATE TABLE "pos_drafts" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenantId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "terminalId" TEXT,
  "convertedOrderId" TEXT,
  "modality" "OrderModality" NOT NULL,
  "status" "PosDraftStatus" NOT NULL DEFAULT 'OPEN',
  "version" INTEGER NOT NULL DEFAULT 0,
  "payloadCiphertext" TEXT NOT NULL,
  "payloadIv" VARCHAR(64) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pos_drafts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pos_drafts_converted_order_key" UNIQUE ("convertedOrderId"),
  CONSTRAINT "pos_drafts_version_check" CHECK ("version" >= 0),
  CONSTRAINT "pos_drafts_expiration_check" CHECK ("expiresAt" > "createdAt")
);

ALTER TABLE "orders"
  ADD COLUMN "posTerminalId" TEXT,
  ADD COLUMN "posTerminalLabelSnapshot" VARCHAR(80);

CREATE TABLE "pos_manual_discount_ledgers" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenantId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "adjustmentId" TEXT NOT NULL,
  "appliedById" TEXT NOT NULL,
  "authorizedById" TEXT NOT NULL,
  "mode" "PosManualDiscountMode" NOT NULL,
  "requestedValue" INTEGER NOT NULL,
  "eligibleBase" INTEGER NOT NULL,
  "amount" INTEGER NOT NULL,
  "reasonCode" "PosManualDiscountReasonCode" NOT NULL,
  "reasonNote" VARCHAR(200),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pos_manual_discount_ledgers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pos_manual_discount_ledgers_order_key" UNIQUE ("orderId"),
  CONSTRAINT "pos_manual_discount_ledgers_adjustment_key" UNIQUE ("adjustmentId"),
  CONSTRAINT "pos_manual_discount_ledgers_amount_check" CHECK (
    "eligibleBase" > 0 AND "amount" > 0 AND "amount" <= "eligibleBase" AND "requestedValue" > 0
  ),
  CONSTRAINT "pos_manual_discount_ledgers_percentage_check" CHECK (
    "mode" <> 'PERCENTAGE' OR "requestedValue" <= 10000
  ),
  CONSTRAINT "pos_manual_discount_ledgers_reason_check" CHECK (
    ("reasonCode" = 'OTHER' AND length(btrim(COALESCE("reasonNote", ''))) BETWEEN 3 AND 200)
    OR ("reasonCode" <> 'OTHER' AND "reasonNote" IS NULL)
  )
);

CREATE UNIQUE INDEX "store_pos_terminals_scope_key" ON "store_pos_terminals"("id", "tenantId", "storeId");
CREATE INDEX "store_pos_terminals_active_idx" ON "store_pos_terminals"("tenantId", "storeId", "isActive", "nameNormalized", "id");

CREATE UNIQUE INDEX "store_pos_shortcuts_scope_key" ON "store_pos_shortcuts"("id", "tenantId", "storeId");
CREATE UNIQUE INDEX "store_pos_shortcuts_product_key" ON "store_pos_shortcuts"("storeId", "productId") WHERE "productId" IS NOT NULL;
CREATE UNIQUE INDEX "store_pos_shortcuts_offer_key" ON "store_pos_shortcuts"("storeId", "offerId") WHERE "offerId" IS NOT NULL;
CREATE INDEX "store_pos_shortcuts_order_idx" ON "store_pos_shortcuts"("tenantId", "storeId", "position", "id");
CREATE INDEX "store_pos_shortcuts_product_scope_idx" ON "store_pos_shortcuts"("productId", "tenantId", "storeId");
CREATE INDEX "store_pos_shortcuts_offer_scope_idx" ON "store_pos_shortcuts"("offerId", "tenantId", "storeId");

CREATE UNIQUE INDEX "pos_drafts_scope_key" ON "pos_drafts"("id", "tenantId", "storeId");
CREATE INDEX "pos_drafts_open_idx" ON "pos_drafts"("tenantId", "storeId", "status", "expiresAt", "updatedAt", "id");
CREATE INDEX "pos_drafts_actor_idx" ON "pos_drafts"("createdById", "status", "updatedAt", "id");
CREATE INDEX "pos_drafts_terminal_scope_idx" ON "pos_drafts"("terminalId", "tenantId", "storeId");

CREATE INDEX "orders_pos_terminal_scope_idx" ON "orders"("posTerminalId", "tenantId", "storeId");
CREATE UNIQUE INDEX "order_price_adjustments_pos_ledger_scope_key" ON "order_price_adjustments"("id", "tenantId", "storeId", "orderId");

CREATE UNIQUE INDEX "pos_manual_discount_ledgers_scope_key" ON "pos_manual_discount_ledgers"("id", "tenantId", "storeId");
CREATE UNIQUE INDEX "pos_manual_discount_ledgers_order_scope_key" ON "pos_manual_discount_ledgers"("orderId", "tenantId", "storeId");
CREATE INDEX "pos_manual_discount_ledgers_store_idx" ON "pos_manual_discount_ledgers"("tenantId", "storeId", "createdAt", "id");
CREATE INDEX "pos_manual_discount_ledgers_actor_idx" ON "pos_manual_discount_ledgers"("appliedById", "createdAt", "id");
CREATE INDEX "pos_manual_discount_ledgers_authorizer_idx" ON "pos_manual_discount_ledgers"("authorizedById", "createdAt", "id");

ALTER TABLE "store_pos_terminals"
  ADD CONSTRAINT "store_pos_terminals_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "store_pos_terminals_store_scope_fkey" FOREIGN KEY ("storeId", "tenantId") REFERENCES "stores"("id", "tenantId") ON DELETE CASCADE;

ALTER TABLE "store_pos_shortcuts"
  ADD CONSTRAINT "store_pos_shortcuts_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "store_pos_shortcuts_store_scope_fkey" FOREIGN KEY ("storeId", "tenantId") REFERENCES "stores"("id", "tenantId") ON DELETE CASCADE,
  ADD CONSTRAINT "store_pos_shortcuts_product_scope_fkey" FOREIGN KEY ("productId", "tenantId", "storeId") REFERENCES "products"("id", "tenantId", "storeId") ON DELETE CASCADE,
  ADD CONSTRAINT "store_pos_shortcuts_offer_scope_fkey" FOREIGN KEY ("offerId", "tenantId", "storeId") REFERENCES "store_offers"("id", "tenantId", "storeId") ON DELETE CASCADE;

ALTER TABLE "pos_drafts"
  ADD CONSTRAINT "pos_drafts_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "pos_drafts_store_scope_fkey" FOREIGN KEY ("storeId", "tenantId") REFERENCES "stores"("id", "tenantId") ON DELETE CASCADE,
  ADD CONSTRAINT "pos_drafts_creator_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "pos_drafts_terminal_scope_fkey" FOREIGN KEY ("terminalId", "tenantId", "storeId") REFERENCES "store_pos_terminals"("id", "tenantId", "storeId") ON DELETE RESTRICT,
  ADD CONSTRAINT "pos_drafts_converted_order_scope_fkey" FOREIGN KEY ("convertedOrderId", "tenantId", "storeId") REFERENCES "orders"("id", "tenantId", "storeId") ON DELETE RESTRICT;

ALTER TABLE "orders"
  ADD CONSTRAINT "orders_pos_terminal_scope_fkey" FOREIGN KEY ("posTerminalId", "tenantId", "storeId") REFERENCES "store_pos_terminals"("id", "tenantId", "storeId") ON DELETE RESTRICT;

ALTER TABLE "pos_manual_discount_ledgers"
  ADD CONSTRAINT "pos_manual_discount_ledgers_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "pos_manual_discount_ledgers_store_scope_fkey" FOREIGN KEY ("storeId", "tenantId") REFERENCES "stores"("id", "tenantId") ON DELETE CASCADE,
  ADD CONSTRAINT "pos_manual_discount_ledgers_order_scope_fkey" FOREIGN KEY ("orderId", "tenantId", "storeId") REFERENCES "orders"("id", "tenantId", "storeId") ON DELETE CASCADE,
  ADD CONSTRAINT "pos_manual_discount_ledgers_adjustment_fkey" FOREIGN KEY ("adjustmentId") REFERENCES "order_price_adjustments"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "pos_manual_discount_ledgers_adjustment_scope_fkey" FOREIGN KEY ("adjustmentId", "tenantId", "storeId", "orderId") REFERENCES "order_price_adjustments"("id", "tenantId", "storeId", "orderId") ON DELETE CASCADE,
  ADD CONSTRAINT "pos_manual_discount_ledgers_applied_by_fkey" FOREIGN KEY ("appliedById") REFERENCES "users"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "pos_manual_discount_ledgers_authorized_by_fkey" FOREIGN KEY ("authorizedById") REFERENCES "users"("id") ON DELETE RESTRICT;

ALTER TABLE "store_pos_terminals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "store_pos_shortcuts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pos_drafts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pos_manual_discount_ledgers" ENABLE ROW LEVEL SECURITY;

COMMIT;

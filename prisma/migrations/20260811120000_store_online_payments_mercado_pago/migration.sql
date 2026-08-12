BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TYPE "StorePaymentMode" AS ENUM ('MANUAL', 'ONLINE');
CREATE TYPE "PaymentProvider" AS ENUM ('MERCADO_PAGO');
CREATE TYPE "PaymentProviderConnectionStatus" AS ENUM (
  'ACTIVE', 'REAUTH_REQUIRED', 'DISCONNECTED', 'REVOKED', 'ERROR'
);
CREATE TYPE "MercadoPagoCreationStatus" AS ENUM (
  'PENDING', 'CREATED', 'RETRYABLE_ERROR', 'FAILED'
);

ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'PAYMENT_PROVIDER_CONNECTED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'PAYMENT_PROVIDER_DISCONNECTED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'PAYMENT_PROVIDER_REAUTH_REQUIRED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'PAYMENT_PROVIDER_STATUS_UPDATED';

ALTER TABLE "store_entitlements"
  ADD COLUMN "onlinePaymentsEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "operationalSlaEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "kdsEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "advancedReportsEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "orderPrintingEnabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "store_settings"
  ADD COLUMN "paymentMode" "StorePaymentMode" NOT NULL DEFAULT 'MANUAL';

ALTER TABLE "payments"
  ADD COLUMN "provider" "PaymentProvider";

ALTER TABLE "orders"
  ALTER COLUMN "paymentReportToken" DROP NOT NULL,
  ALTER COLUMN "paymentReportExpiresAt" DROP NOT NULL;

CREATE TABLE "store_payment_provider_connections" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "provider" "PaymentProvider" NOT NULL,
  "status" "PaymentProviderConnectionStatus" NOT NULL DEFAULT 'ERROR',
  "providerUserId" VARCHAR(64) NOT NULL,
  "liveMode" BOOLEAN NOT NULL,
  "scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "accessTokenCiphertext" TEXT,
  "accessTokenIv" VARCHAR(64),
  "refreshTokenCiphertext" TEXT,
  "refreshTokenIv" VARCHAR(64),
  "tokenExpiresAt" TIMESTAMP(3),
  "credentialVersion" INTEGER NOT NULL DEFAULT 1,
  "refreshLeaseId" UUID,
  "refreshLeaseExpiresAt" TIMESTAMP(3),
  "connectedAt" TIMESTAMP(3),
  "refreshedAt" TIMESTAMP(3),
  "disconnectedAt" TIMESTAMP(3),
  "reauthRequiredAt" TIMESTAMP(3),
  "lastErrorCode" VARCHAR(64),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "store_payment_provider_connections_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "store_payment_provider_connections_token_pairs_check" CHECK (
    ("accessTokenCiphertext" IS NULL) = ("accessTokenIv" IS NULL)
    AND ("refreshTokenCiphertext" IS NULL) = ("refreshTokenIv" IS NULL)
  ),
  CONSTRAINT "store_payment_provider_connections_credential_version_check"
    CHECK ("credentialVersion" = 1)
);

CREATE UNIQUE INDEX "store_payment_provider_connections_storeId_provider_key"
  ON "store_payment_provider_connections"("storeId", "provider");
CREATE UNIQUE INDEX "store_payment_provider_connections_id_tenantId_storeId_key"
  ON "store_payment_provider_connections"("id", "tenantId", "storeId");
CREATE INDEX "store_payment_provider_connections_provider_providerUserId_idx"
  ON "store_payment_provider_connections"("provider", "providerUserId");
CREATE INDEX "store_payment_provider_connections_tenantId_storeId_status_idx"
  ON "store_payment_provider_connections"("tenantId", "storeId", "status");
CREATE INDEX "store_payment_provider_connections_refreshLeaseExpiresAt_idx"
  ON "store_payment_provider_connections"("refreshLeaseExpiresAt");

ALTER TABLE "store_payment_provider_connections"
  ADD CONSTRAINT "store_payment_provider_connections_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "store_payment_provider_connections_storeId_tenantId_fkey"
  FOREIGN KEY ("storeId", "tenantId") REFERENCES "stores"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "payment_provider_oauth_attempts" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "provider" "PaymentProvider" NOT NULL,
  "initiatedById" TEXT NOT NULL,
  "stateHash" VARCHAR(64) NOT NULL,
  "codeVerifierCiphertext" TEXT,
  "codeVerifierIv" VARCHAR(64),
  "credentialVersion" INTEGER NOT NULL DEFAULT 1,
  "returnPath" VARCHAR(500) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "payment_provider_oauth_attempts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payment_provider_oauth_attempts_verifier_pair_check" CHECK (
    ("codeVerifierCiphertext" IS NULL) = ("codeVerifierIv" IS NULL)
  ),
  CONSTRAINT "payment_provider_oauth_attempts_credential_version_check"
    CHECK ("credentialVersion" = 1),
  CONSTRAINT "payment_provider_oauth_attempts_expiry_check"
    CHECK ("expiresAt" > "createdAt")
);

CREATE UNIQUE INDEX "payment_provider_oauth_attempts_stateHash_key"
  ON "payment_provider_oauth_attempts"("stateHash");
CREATE UNIQUE INDEX "payment_provider_oauth_attempts_id_tenantId_storeId_key"
  ON "payment_provider_oauth_attempts"("id", "tenantId", "storeId");
CREATE INDEX "payment_provider_oauth_attempts_tenantId_storeId_provider_createdAt_idx"
  ON "payment_provider_oauth_attempts"("tenantId", "storeId", "provider", "createdAt");
CREATE INDEX "payment_provider_oauth_attempts_expiresAt_consumedAt_idx"
  ON "payment_provider_oauth_attempts"("expiresAt", "consumedAt");
CREATE INDEX "payment_provider_oauth_attempts_initiatedById_idx"
  ON "payment_provider_oauth_attempts"("initiatedById");

ALTER TABLE "payment_provider_oauth_attempts"
  ADD CONSTRAINT "payment_provider_oauth_attempts_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "payment_provider_oauth_attempts_storeId_tenantId_fkey"
  FOREIGN KEY ("storeId", "tenantId") REFERENCES "stores"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "payment_provider_oauth_attempts_initiatedById_fkey"
  FOREIGN KEY ("initiatedById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "mercado_pago_payments" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "paymentId" TEXT NOT NULL,
  "connectionId" TEXT NOT NULL,
  "creationStatus" "MercadoPagoCreationStatus" NOT NULL DEFAULT 'PENDING',
  "externalReference" VARCHAR(150) NOT NULL,
  "idempotencyKey" VARCHAR(150) NOT NULL,
  "providerOrderId" VARCHAR(100),
  "providerPaymentId" VARCHAR(100),
  "providerStatus" VARCHAR(64),
  "providerStatusDetail" VARCHAR(64),
  "qrCode" TEXT,
  "ticketUrl" TEXT,
  "expiresAt" TIMESTAMP(3),
  "payerEmailCiphertext" TEXT,
  "payerEmailIv" VARCHAR(64),
  "credentialVersion" INTEGER NOT NULL DEFAULT 1,
  "lastErrorCode" VARCHAR(64),
  "lastSyncedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "mercado_pago_payments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "mercado_pago_payments_email_pair_check" CHECK (
    ("payerEmailCiphertext" IS NULL) = ("payerEmailIv" IS NULL)
  ),
  CONSTRAINT "mercado_pago_payments_credential_version_check"
    CHECK ("credentialVersion" = 1)
);

CREATE UNIQUE INDEX "mercado_pago_payments_orderId_key" ON "mercado_pago_payments"("orderId");
CREATE UNIQUE INDEX "mercado_pago_payments_paymentId_key" ON "mercado_pago_payments"("paymentId");
CREATE UNIQUE INDEX "mercado_pago_payments_externalReference_key" ON "mercado_pago_payments"("externalReference");
CREATE UNIQUE INDEX "mercado_pago_payments_idempotencyKey_key" ON "mercado_pago_payments"("idempotencyKey");
CREATE UNIQUE INDEX "mercado_pago_payments_providerOrderId_key" ON "mercado_pago_payments"("providerOrderId");
CREATE UNIQUE INDEX "mercado_pago_payments_providerPaymentId_key" ON "mercado_pago_payments"("providerPaymentId");
CREATE UNIQUE INDEX "mercado_pago_payments_id_tenantId_storeId_key"
  ON "mercado_pago_payments"("id", "tenantId", "storeId");
CREATE UNIQUE INDEX "mercado_pago_payments_orderId_tenantId_storeId_key"
  ON "mercado_pago_payments"("orderId", "tenantId", "storeId");
CREATE UNIQUE INDEX "mercado_pago_payments_paymentId_orderId_key"
  ON "mercado_pago_payments"("paymentId", "orderId");
CREATE INDEX "mercado_pago_payments_tenantId_storeId_creationStatus_idx"
  ON "mercado_pago_payments"("tenantId", "storeId", "creationStatus");
CREATE INDEX "mercado_pago_payments_connectionId_createdAt_idx"
  ON "mercado_pago_payments"("connectionId", "createdAt");
CREATE INDEX "mercado_pago_payments_providerStatus_providerStatusDetail_idx"
  ON "mercado_pago_payments"("providerStatus", "providerStatusDetail");

ALTER TABLE "mercado_pago_payments"
  ADD CONSTRAINT "mercado_pago_payments_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "mercado_pago_payments_storeId_tenantId_fkey"
  FOREIGN KEY ("storeId", "tenantId") REFERENCES "stores"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "mercado_pago_payments_orderId_tenantId_storeId_fkey"
  FOREIGN KEY ("orderId", "tenantId", "storeId") REFERENCES "orders"("id", "tenantId", "storeId") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "mercado_pago_payments_paymentId_orderId_fkey"
  FOREIGN KEY ("paymentId", "orderId") REFERENCES "payments"("id", "orderId") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "mercado_pago_payments_connectionId_tenantId_storeId_fkey"
  FOREIGN KEY ("connectionId", "tenantId", "storeId") REFERENCES "store_payment_provider_connections"("id", "tenantId", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "payment_provider_webhook_events" (
  "id" TEXT NOT NULL,
  "provider" "PaymentProvider" NOT NULL,
  "providerEventId" VARCHAR(150) NOT NULL,
  "topic" VARCHAR(32) NOT NULL,
  "action" VARCHAR(64) NOT NULL,
  "providerUserId" VARCHAR(100),
  "processedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_provider_webhook_events_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "payment_provider_webhook_events_provider_providerEventId_key"
  ON "payment_provider_webhook_events"("provider", "providerEventId");
CREATE INDEX "payment_provider_webhook_events_provider_providerUserId_createdAt_idx"
  ON "payment_provider_webhook_events"("provider", "providerUserId", "createdAt");

ALTER TABLE "store_payment_provider_connections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payment_provider_oauth_attempts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "mercado_pago_payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payment_provider_webhook_events" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE "store_payment_provider_connections" FROM anon;
    REVOKE ALL ON TABLE "payment_provider_oauth_attempts" FROM anon;
    REVOKE ALL ON TABLE "mercado_pago_payments" FROM anon;
    REVOKE ALL ON TABLE "payment_provider_webhook_events" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "store_payment_provider_connections" FROM authenticated;
    REVOKE ALL ON TABLE "payment_provider_oauth_attempts" FROM authenticated;
    REVOKE ALL ON TABLE "mercado_pago_payments" FROM authenticated;
    REVOKE ALL ON TABLE "payment_provider_webhook_events" FROM authenticated;
  END IF;
END $$;

COMMIT;

-- Rollback operacional: mantenha as tabelas enquanto houver pagamentos em aberto.
-- Desative novas cobranças com MERCADO_PAGO_ENABLED=false; não use down migration
-- em produção até que todos os registros tenham sido reconciliados e exportados.

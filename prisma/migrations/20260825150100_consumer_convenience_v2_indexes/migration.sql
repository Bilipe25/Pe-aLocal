-- Índices online da Identidade Progressiva V2.
-- Executar fora de uma transação para preservar CONCURRENTLY.

CREATE INDEX CONCURRENTLY IF NOT EXISTS "consumer_favorites_identity_store_created_idx"
  ON "consumer_favorites"("consumerIdentityId", "tenantId", "storeId", "createdAt" DESC, "id");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "consumer_favorites_product_scope_idx"
  ON "consumer_favorites"("productId", "tenantId", "storeId");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "consumer_email_change_identity_active_idx"
  ON "consumer_email_change_requests"("consumerIdentityId", "status", "expiresAt");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "consumer_email_change_target_active_idx"
  ON "consumer_email_change_requests"("newEmailNormalized", "status", "expiresAt");

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "consumer_email_change_one_active_per_identity_idx"
  ON "consumer_email_change_requests"("consumerIdentityId")
  WHERE "status" IN ('PENDING', 'CURRENT_VERIFIED');

CREATE INDEX CONCURRENTLY IF NOT EXISTS "consumer_sessions_identity_last_used_idx"
  ON "consumer_sessions"("consumerIdentityId", "revokedAt", "lastUsedAt" DESC, "id");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "consumer_verification_request_ip_created_idx"
  ON "consumer_verification_challenges"("requestIpHash", "createdAt")
  WHERE "requestIpHash" IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS "consumer_verification_email_change_idx"
  ON "consumer_verification_challenges"("emailChangeRequestId", "purpose", "status")
  WHERE "emailChangeRequestId" IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS "orders_customer_completed_paid_idx"
  ON "orders"("tenantId", "storeId", "customerId", "createdAt" DESC, "id" DESC)
  WHERE "customerId" IS NOT NULL
    AND "status" = 'DELIVERED'::"OrderStatus"
    AND "paymentStatus" = 'PAID'::"PaymentStatus";

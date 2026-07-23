-- Keep this as the only statement: PostgreSQL forbids concurrent index builds
-- inside the implicit transaction created for a multi-statement migration.
CREATE INDEX CONCURRENTLY "orders_tenantId_storeId_createdAt_id_idx"
  ON "orders"("tenantId", "storeId", "createdAt", "id");

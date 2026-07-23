-- Keep this concurrent index build isolated in its own migration.
CREATE INDEX CONCURRENTLY "orders_storeId_status_createdAt_id_idx"
  ON "orders"("storeId", "status", "createdAt", "id");

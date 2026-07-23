-- Keep this concurrent index build isolated in its own migration.
CREATE INDEX CONCURRENTLY "orders_storeId_status_statusChangedAt_id_idx"
  ON "orders"("storeId", "status", "statusChangedAt", "id");

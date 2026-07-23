-- Keep this concurrent index build isolated in its own migration.
CREATE INDEX CONCURRENTLY "orders_storeId_paymentStatus_createdAt_id_idx"
  ON "orders"("storeId", "paymentStatus", "createdAt", "id");

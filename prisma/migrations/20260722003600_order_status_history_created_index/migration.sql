-- Keep this concurrent index build isolated in its own migration.
CREATE INDEX CONCURRENTLY "order_status_history_orderId_createdAt_id_idx"
  ON "order_status_history"("orderId", "createdAt", "id");

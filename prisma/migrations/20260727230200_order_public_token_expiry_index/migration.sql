-- Single-statement migration: PostgreSQL requires this index build to remain
-- outside a transaction so writes to the orders table are not blocked.
CREATE INDEX CONCURRENTLY "orders_publicTokenExpiresAt_idx"
  ON "orders"("publicTokenExpiresAt");

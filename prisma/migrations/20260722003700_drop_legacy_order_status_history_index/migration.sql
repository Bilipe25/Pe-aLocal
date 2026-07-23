-- Keep this concurrent index removal isolated in its own migration.
DROP INDEX CONCURRENTLY IF EXISTS "order_status_history_orderId_createdAt_idx";

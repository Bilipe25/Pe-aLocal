-- Keep this partial concurrent index build isolated in its own migration.
CREATE INDEX CONCURRENTLY "order_outbox_events_processed_retention_idx"
  ON public.order_outbox_events("processedAt")
  WHERE "status" = 'PROCESSED' AND "processedAt" IS NOT NULL;

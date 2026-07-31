-- Keep this concurrent index build isolated in its own migration.
CREATE INDEX CONCURRENTLY "orders_customerId_idx"
  ON public.orders("customerId");

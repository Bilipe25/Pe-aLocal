-- Keep this concurrent index build isolated in its own migration.
CREATE INDEX CONCURRENTLY "orders_cancelledById_idx"
  ON public.orders("cancelledById");

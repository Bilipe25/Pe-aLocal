-- Keep this concurrent index build isolated in its own migration.
CREATE INDEX CONCURRENTLY "order_items_orderId_position_id_idx"
  ON public.order_items("orderId", "position", "id");

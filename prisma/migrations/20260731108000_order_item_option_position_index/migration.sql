-- Keep this concurrent index build isolated in its own migration.
CREATE INDEX CONCURRENTLY "order_item_options_orderItemId_groupPosition_position_id_idx"
  ON public.order_item_options("orderItemId", "groupPosition", "position", "id");

-- Operational rollback: deploy the previous application first. It remains compatible
-- because position columns have database defaults and group snapshots are optional.
-- Physical rollback is destructive and must run only after exporting new snapshot data.
DROP INDEX IF EXISTS public."order_items_orderId_position_id_idx";
DROP INDEX IF EXISTS public."order_item_options_orderItemId_groupPosition_position_id_idx";

CREATE INDEX IF NOT EXISTS "order_items_orderId_idx"
  ON public.order_items("orderId");
CREATE INDEX IF NOT EXISTS "order_item_options_orderItemId_idx"
  ON public.order_item_options("orderItemId");

ALTER TABLE public.order_item_options
  DROP CONSTRAINT IF EXISTS "order_item_options_group_snapshot_consistency_check",
  DROP CONSTRAINT IF EXISTS "order_item_options_group_position_nonnegative_check",
  DROP CONSTRAINT IF EXISTS "order_item_options_position_nonnegative_check",
  DROP COLUMN IF EXISTS "groupPosition",
  DROP COLUMN IF EXISTS "groupName",
  DROP COLUMN IF EXISTS "groupId",
  DROP COLUMN IF EXISTS "position";

ALTER TABLE public.order_items
  DROP CONSTRAINT IF EXISTS "order_items_position_nonnegative_check",
  DROP COLUMN IF EXISTS "position";

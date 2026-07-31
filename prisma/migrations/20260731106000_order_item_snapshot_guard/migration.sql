-- Guard new writes while keeping the application rollback-compatible through defaults.
BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

ALTER TABLE public.order_items
  ALTER COLUMN "position" SET DEFAULT 0,
  ADD CONSTRAINT "order_items_position_nonnegative_check"
    CHECK ("position" >= 0) NOT VALID;

ALTER TABLE public.order_item_options
  ALTER COLUMN "position" SET DEFAULT 0,
  ALTER COLUMN "groupPosition" SET DEFAULT 0,
  ADD CONSTRAINT "order_item_options_position_nonnegative_check"
    CHECK ("position" >= 0) NOT VALID,
  ADD CONSTRAINT "order_item_options_group_position_nonnegative_check"
    CHECK ("groupPosition" >= 0) NOT VALID,
  ADD CONSTRAINT "order_item_options_group_snapshot_consistency_check"
    CHECK (
      ("groupId" IS NULL AND "groupName" IS NULL)
      OR ("groupId" IS NOT NULL AND "groupName" IS NOT NULL)
    ) NOT VALID;

ALTER TABLE public.order_items
  VALIDATE CONSTRAINT "order_items_position_nonnegative_check";

ALTER TABLE public.order_item_options
  VALIDATE CONSTRAINT "order_item_options_position_nonnegative_check",
  VALIDATE CONSTRAINT "order_item_options_group_position_nonnegative_check",
  VALIDATE CONSTRAINT "order_item_options_group_snapshot_consistency_check";

ALTER TABLE public.order_items
  ALTER COLUMN "position" SET NOT NULL;

ALTER TABLE public.order_item_options
  ALTER COLUMN "position" SET NOT NULL,
  ALTER COLUMN "groupPosition" SET NOT NULL;

COMMIT;

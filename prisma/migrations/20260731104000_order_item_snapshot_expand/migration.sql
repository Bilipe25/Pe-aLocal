-- Expand-only snapshot metadata for stable order item rendering.
-- Columns remain nullable until the deterministic legacy backfill completes.
BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

ALTER TABLE public.order_items
  ADD COLUMN "position" INTEGER DEFAULT 0;

ALTER TABLE public.order_item_options
  ADD COLUMN "position" INTEGER DEFAULT 0,
  ADD COLUMN "groupId" TEXT,
  ADD COLUMN "groupName" TEXT,
  ADD COLUMN "groupPosition" INTEGER DEFAULT 0;

COMMIT;

-- Legacy orders did not persist catalog order or option-group identity.
-- Use UUID order only as a deterministic fallback and do not fabricate group data.
BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

WITH ranked_items AS (
  SELECT
    "id",
    (ROW_NUMBER() OVER (PARTITION BY "orderId" ORDER BY "id") - 1)::INTEGER AS "position"
  FROM public.order_items
)
UPDATE public.order_items AS target
SET "position" = ranked_items."position"
FROM ranked_items
WHERE target."id" = ranked_items."id";

WITH ranked_options AS (
  SELECT
    "id",
    (ROW_NUMBER() OVER (PARTITION BY "orderItemId" ORDER BY "id") - 1)::INTEGER AS "position"
  FROM public.order_item_options
)
UPDATE public.order_item_options AS target
SET
  "position" = ranked_options."position",
  "groupPosition" = 0
FROM ranked_options
WHERE target."id" = ranked_options."id";

COMMIT;

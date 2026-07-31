-- The new ordered index has the same leading foreign-key column.
DROP INDEX CONCURRENTLY public."order_items_orderId_idx";

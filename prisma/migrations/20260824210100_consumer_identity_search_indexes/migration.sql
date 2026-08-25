-- Keep concurrent customer search indexes isolated from transactional DDL.
CREATE INDEX CONCURRENTLY "customers_tenant_name_prefix_idx"
  ON public.customers("tenantId", lower("name") text_pattern_ops, "id");

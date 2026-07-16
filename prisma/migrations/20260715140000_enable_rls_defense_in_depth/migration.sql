-- A aplicação acessa dados exclusivamente no servidor via Prisma + Hyperdrive.
-- A Data API fica deny-by-default: nenhuma policy é criada para anon/authenticated.
DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'users', 'sessions', 'tenants', 'tenant_members', 'stores',
    'store_settings', 'store_addresses', 'opening_hours', 'categories',
    'products', 'product_option_groups', 'product_options', 'delivery_zones',
    'customers', 'customer_addresses', 'orders', 'order_items',
    'order_item_options', 'order_status_history', 'payments', 'coupons',
    'coupon_usages', 'audit_logs'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', table_name);
  END LOOP;
END $$;

-- Rollback controlado (executar apenas se a Data API precisar ser reaberta):
-- ALTER TABLE public.<table> DISABLE ROW LEVEL SECURITY;
-- Reaplique apenas os GRANTs e policies específicos necessários; nunca GRANT ALL.

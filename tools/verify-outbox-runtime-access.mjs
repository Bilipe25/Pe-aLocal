import { Client } from 'pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString)
  throw new Error('DATABASE_URL is required for the outbox runtime preflight.');

const client = new Client({ connectionString });
await client.connect();

try {
  const result = await client.query(`
    SELECT
      current_user AS role,
      has_table_privilege(current_user, 'public.order_outbox_events', 'SELECT') AS can_select,
      has_table_privilege(current_user, 'public.order_outbox_events', 'INSERT') AS can_insert,
      has_table_privilege(current_user, 'public.order_outbox_events', 'UPDATE') AS can_update,
      has_schema_privilege(current_user, 'public', 'USAGE') AS can_use_schema,
      pg_get_userbyid(table_class.relowner) = current_user AS owns_table,
      role_config.rolbypassrls AS bypasses_rls,
      table_class.relrowsecurity AS rls_enabled
    FROM pg_class AS table_class
    JOIN pg_namespace AS table_namespace ON table_namespace.oid = table_class.relnamespace
    JOIN pg_roles AS role_config ON role_config.rolname = current_user
    WHERE table_namespace.nspname = 'public'
      AND table_class.relname = 'order_outbox_events'
  `);
  const access = result.rows[0];
  if (
    !access ||
    !access.can_select ||
    !access.can_insert ||
    !access.can_update ||
    !access.can_use_schema ||
    !access.rls_enabled ||
    (!access.owns_table && !access.bypasses_rls)
  ) {
    throw new Error('The Hyperdrive database role cannot safely access order_outbox_events.');
  }
  console.info('[ORDER_OUTBOX_RUNTIME_ACCESS_OK]', { role: access.role });
} finally {
  await client.end();
}

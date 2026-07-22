import { Client } from 'pg';

const connectionString = process.env.DIRECT_URL;
if (!connectionString) throw new Error('DIRECT_URL is required for the payment preflight.');

const client = new Client({ connectionString });
await client.connect();

try {
  const ledger = await client.query(`SELECT to_regclass('public._prisma_migrations') AS name`);
  if (ledger.rows[0]?.name) {
    const legacyMigration = await client.query(`
      SELECT migration_name
      FROM public._prisma_migrations
      WHERE migration_name = '20260722170000_payment_lifecycle_consistency'
        AND finished_at IS NOT NULL
        AND rolled_back_at IS NULL
      LIMIT 1
    `);
    if (legacyMigration.rowCount) {
      throw new Error(
        'The replaced payment lifecycle migration is already applied. Restore its original file and create forward-only migrations before deploying.',
      );
    }
  }

  const result = await client.query(`
    SELECT COUNT(*)::integer AS inconsistent_count
    FROM public.orders AS orders
    LEFT JOIN public.payments AS payments ON payments."orderId" = orders.id
    WHERE payments.id IS NULL
      OR payments.status IS DISTINCT FROM orders."paymentStatus"
      OR payments.method IS DISTINCT FROM orders."paymentMethod"
      OR payments.amount IS DISTINCT FROM orders.total
      OR payments.amount < 0
  `);
  const inconsistentCount = result.rows[0]?.inconsistent_count;
  if (inconsistentCount !== 0) {
    throw new Error(
      `Payment consistency preflight found ${inconsistentCount ?? 'unknown'} incompatible orders.`,
    );
  }
  console.info('[PAYMENT_CONSISTENCY_PREFLIGHT_OK]');
} finally {
  await client.end();
}

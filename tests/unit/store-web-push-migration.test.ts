import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('migration Merchant Web Push', () => {
  const sql = readFileSync(
    resolve(
      process.cwd(),
      'prisma/migrations/20260810230000_store_operational_web_push/migration.sql',
    ),
    'utf8',
  );

  it('cria associaÃ§Ã£o e ledgers separados com idempotÃªncia e RLS', () => {
    expect(sql).toContain('store_staff_push_subscriptions');
    expect(sql).toContain('store_web_push_dispatches');
    expect(sql).toContain('store_web_push_deliveries');
    expect(sql).toContain(
      'ON "store_web_push_deliveries"("orderOutboxEventId", "webPushSubscriptionId")',
    );
    expect(sql.match(/ENABLE ROW LEVEL SECURITY/g)).toHaveLength(3);
    expect(sql.match(/REVOKE ALL ON TABLE/g)).toHaveLength(3);
    expect(sql).toContain('tenant_members');
  });
});

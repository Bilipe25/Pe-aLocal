import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('migration Web Push', () => {
  const sql = readFileSync(
    resolve(process.cwd(), 'prisma/migrations/20260810200000_consumer_web_push/migration.sql'),
    'utf8',
  );

  it('cria ledger independente, constraints idempotentes e RLS', () => {
    expect(sql).toContain('web_push_subscriptions');
    expect(sql).toContain('order_push_subscriptions');
    expect(sql).toContain('web_push_dispatches');
    expect(sql).toContain('web_push_deliveries');
    expect(sql).toContain('UNIQUE ("orderOutboxEventId", "webPushSubscriptionId")');
    expect(sql.match(/ENABLE ROW LEVEL SECURITY/g)).toHaveLength(4);
    expect(sql.match(/REVOKE ALL ON TABLE/g)).toHaveLength(4);
  });
});

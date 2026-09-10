import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const migrationPath = path.join(
  process.cwd(),
  'prisma',
  'migrations',
  '20260902120000_customer_relationship_v3',
  'migration.sql',
);
const migration = fs.readFileSync(migrationPath, 'utf8');
const schema = fs.readFileSync(path.join(process.cwd(), 'prisma', 'schema.prisma'), 'utf8');

describe('customer relationship V3 migration contract', () => {
  it('nasce desligada e só adiciona estruturas V3', () => {
    expect(schema).toMatch(/customerRelationshipEnabled\s+Boolean\s+@default\(false\)/);
    expect(migration).toContain(
      'ADD COLUMN "customerRelationshipEnabled" BOOLEAN NOT NULL DEFAULT false',
    );
    expect(migration).not.toMatch(/DROP\s+(TABLE|COLUMN|TYPE)/i);
  });

  it('materializa idempotência, isolamento e índices de leitura', () => {
    expect(migration).toContain('customer_relationship_processed_orders');
    expect(migration).toContain('customer_return_campaign_recipients');
    expect(migration).toContain('customer_return_campaign_orders');
    expect(migration).toContain('customer_relationship_identity_key');
    expect(migration).toContain('customer_return_recipient_campaign_identity_key');
    expect(migration).toContain('customer_relationship_segment_idx');
  });

  it('mantém as tabelas privadas sem grants da Data API', () => {
    for (const table of [
      'customer_relationship_snapshots',
      'customer_relationship_processed_orders',
      'consumer_communication_preferences',
      'customer_return_campaigns',
      'customer_return_campaign_recipients',
      'customer_return_campaign_orders',
    ]) {
      expect(migration).toContain(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`);
      expect(migration).toContain(`"${table}"`);
    }
    expect(migration).toMatch(/REVOKE ALL ON TABLE[\s\S]+FROM PUBLIC, anon, authenticated/);
  });
});

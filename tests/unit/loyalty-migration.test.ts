import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve('prisma/migrations/20260827120000_loyalty_v1/migration.sql'),
  'utf8',
);

describe('migration da Fidelidade V1', () => {
  it('mantém a capability desligada por padrão', () => {
    expect(migration).toContain('ADD COLUMN "loyaltyEnabled" BOOLEAN NOT NULL DEFAULT false');
  });

  it('impede contribuição duplicada e dois programas ou ciclos ativos', () => {
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "loyalty_contributions_order_tenant_store_key"',
    );
    expect(migration).toContain('CREATE UNIQUE INDEX "loyalty_programs_one_active_per_store"');
    expect(migration).toContain('CREATE UNIQUE INDEX "loyalty_cycles_one_active_per_consumer"');
  });

  it('protege as tabelas privadas no schema público', () => {
    for (const table of [
      'loyalty_programs',
      'loyalty_cycles',
      'loyalty_contributions',
      'loyalty_rewards',
    ]) {
      expect(migration).toContain(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`);
    }
    expect(migration).toContain('FROM PUBLIC, anon, authenticated');
  });

  it('escopa relações comerciais por tenant e loja', () => {
    expect(migration).toContain(
      'FOREIGN KEY ("orderId", "tenantId", "storeId") REFERENCES "orders"',
    );
    expect(migration).toContain(
      'FOREIGN KEY ("programId", "tenantId", "storeId") REFERENCES "loyalty_programs"',
    );
    expect(migration).toContain(
      'FOREIGN KEY ("cycleId", "tenantId", "storeId") REFERENCES "loyalty_cycles"',
    );
  });
});

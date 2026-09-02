import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve('prisma/migrations/20260827120000_loyalty_v1/migration.sql'),
  'utf8',
);
const v2Migration = readFileSync(
  resolve('prisma/migrations/20260827160000_loyalty_v2_advanced_rewards/migration.sql'),
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

describe('migration da Fidelidade V2', () => {
  it('mantém a capability avançada desligada por padrão e preserva o tipo V1', () => {
    expect(v2Migration).toContain(
      'ADD COLUMN "loyaltyAdvancedRewardsEnabled" BOOLEAN NOT NULL DEFAULT false',
    );
    expect(v2Migration).toContain(
      '"rewardType" "LoyaltyRewardType" NOT NULL DEFAULT \'FIXED_DISCOUNT\'',
    );
  });

  it('protege coerência, validade e expiração no banco', () => {
    expect(v2Migration).toContain('loyalty_program_reward_configuration_check');
    expect(v2Migration).toContain('"validityDays" IN (30, 60, 90)');
    expect(v2Migration).toContain('loyalty_reward_expiry_state_check');
  });

  it('adiciona somente os índices usados pelas consultas de disponibilidade', () => {
    expect(v2Migration).toContain('loyalty_rewards_consumer_status_expiry_idx');
    expect(v2Migration).toContain('loyalty_rewards_available_expiry_idx');
    expect(v2Migration).toContain('WHERE "status" = \'AVAILABLE\'');
  });

  it('registra eventos de fidelidade no outbox existente', () => {
    expect(v2Migration).toContain("ADD VALUE 'LOYALTY_REWARD_EARNED'");
    expect(v2Migration).toContain("ADD VALUE 'LOYALTY_REWARD_EXPIRING'");
    expect(v2Migration).toContain("ADD VALUE 'LOYALTY_REWARD_REDEEMED'");
  });
});

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('migration do SLA operacional', () => {
  const sql = readFileSync(
    resolve(process.cwd(), 'prisma/migrations/20260817223000_operational_sla/migration.sql'),
    'utf8',
  );

  it('adiciona watermark de ativação e preserva pedidos existentes', () => {
    expect(sql).toContain('ADD COLUMN "operationalSlaEnabledAt"');
    expect(sql).toContain('SET "operationalSlaEnabledAt" = CURRENT_TIMESTAMP');
    expect(sql).not.toMatch(/UPDATE\s+"orders"/i);
  });

  it('cria alertas e deliveries idempotentes, privados e com cascade', () => {
    expect(sql).toContain('CREATE TYPE "OrderOperationalSlaStage"');
    expect(sql).toContain('ON "order_operational_sla_alerts"("orderId", "actionableAt", "stage")');
    expect(sql).toContain(
      'ON "order_operational_sla_deliveries"("slaAlertId", "webPushSubscriptionId")',
    );
    expect(sql.match(/ENABLE ROW LEVEL SECURITY/g)).toHaveLength(2);
    expect(sql.match(/REVOKE ALL ON TABLE/g)).toHaveLength(2);
    expect(sql).toContain('ON DELETE CASCADE');
  });
});

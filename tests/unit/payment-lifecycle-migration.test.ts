import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationDirectories = [
  '20260722170000_payment_lifecycle_expand',
  '20260722170500_payment_history_expand',
  '20260722171000_payment_lifecycle_backfill',
  '20260722172000_payment_consistency_guard',
] as const;
const migrations = migrationDirectories.map((directory) =>
  readFileSync(join(process.cwd(), `prisma/migrations/${directory}/migration.sql`), 'utf8'),
);
const migration = migrations.join('\n');

describe('payment lifecycle consistency migration', () => {
  it('é atômica e limita espera por locks', () => {
    for (const sql of migrations) {
      expect(sql.trimStart()).toMatch(/^BEGIN;/);
      expect(sql).toContain('COMMIT;');
    }
    expect(migration).toContain("SET LOCAL lock_timeout = '5s'");
    expect(migrations[0]).toContain('Worker anterior compatível');
    expect(migrations[0]).toContain("DEFAULT (CURRENT_TIMESTAMP + INTERVAL '7 days')");
    expect(migrations[1]).toContain('payments_capture_legacy_status_history');
    expect(migrations[1]).toContain('payments_populate_legacy_lifecycle_metadata');
    expect(migrations[1]).toContain('ON CONFLICT ("paymentId", "orderVersionTo", "toStatus")');
  });

  it('faz backfill conservador dos timestamps financeiros', () => {
    expect(migration).toContain('SET "reportedAt" = COALESCE("reportedAt", "updatedAt")');
    expect(migration).toContain('SET "failedAt" = COALESCE("failedAt", "updatedAt")');
    expect(migration).toContain('SET "cancelledAt" = COALESCE("cancelledAt", "updatedAt")');
    expect(migration).toContain('"refundAmount" = COALESCE("refundAmount", amount)');
  });

  it('aborta em dados divergentes antes de instalar o guardião', () => {
    expect(migration).toContain('order/payment consistency precondition failed');
    expect(migration).toContain('payments.status IS DISTINCT FROM orders."paymentStatus"');
    expect(migration).toContain('payments.method IS DISTINCT FROM orders."paymentMethod"');
    expect(migration).toContain('payments.amount IS DISTINCT FROM orders.total');
  });

  it('valida a consistência no commit e permite dual-write transacional', () => {
    expect(migration).toContain('CREATE CONSTRAINT TRIGGER "orders_payment_consistency_check"');
    expect(migration).toContain('CREATE CONSTRAINT TRIGGER "payments_order_consistency_check"');
    expect(migration.match(/DEFERRABLE INITIALLY DEFERRED/g)).toHaveLength(2);
    expect(migration).toContain('payments.status = orders."paymentStatus"');
    expect(migration).toContain('payments.method = orders."paymentMethod"');
    expect(migration).toContain('payments.amount = orders.total');
  });

  it('protege metadados mínimos de reembolso e estados terminais', () => {
    expect(migration).toContain('CREATE TABLE public.payment_status_history');
    expect(migration).toContain('Estado financeiro existente no início do histórico estruturado.');
    expect(migration).toContain('ENABLE ROW LEVEL SECURITY');
    expect(migration).toContain('payments_lifecycle_metadata_check');
    expect(migration).toContain('status <> \'CANCELLED\' OR "cancelledAt" IS NOT NULL');
    expect(migration).toContain('"refundAmount" = amount');
    expect(migration).toContain('"refundAmount" IS NOT NULL');
    expect(migration).toContain('payment_status_history_reject_update');
    expect(migration).toContain('BEFORE UPDATE OR DELETE ON public.payment_status_history');
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.assert_order_payment_consistency()');
  });
});

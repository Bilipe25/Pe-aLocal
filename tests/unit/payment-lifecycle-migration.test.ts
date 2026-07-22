import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(
    process.cwd(),
    'prisma/migrations/20260722170000_payment_lifecycle_consistency/migration.sql',
  ),
  'utf8',
);

describe('payment lifecycle consistency migration', () => {
  it('é atômica e limita espera por locks', () => {
    expect(migration.trimStart()).toMatch(/^BEGIN;/);
    expect(migration).toContain("SET LOCAL lock_timeout = '5s'");
    expect(migration).toContain('COMMIT;');
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
    expect(migration).toContain('CONSTRAINT "payments_lifecycle_metadata_check"');
    expect(migration).toContain('"refundAmount" = amount');
    expect(migration).toContain('"refundReasonCode" IS NOT NULL');
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.assert_order_payment_consistency()');
  });
});

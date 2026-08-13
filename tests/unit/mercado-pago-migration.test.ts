import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(
    process.cwd(),
    'prisma/migrations/20260811120000_store_online_payments_mercado_pago/migration.sql',
  ),
  'utf8',
);
const integrityMigration = readFileSync(
  join(process.cwd(), 'prisma/migrations/20260812203000_online_payment_integrity/migration.sql'),
  'utf8',
);

describe('migration de pagamentos online', () => {
  it('é aditiva, transacional e preserva os defaults manuais', () => {
    expect(migration).toContain('BEGIN;');
    expect(migration).toContain('COMMIT;');
    expect(migration).toContain('"paymentMode" "StorePaymentMode" NOT NULL DEFAULT \'MANUAL\'');
    expect(migration).toContain('"onlinePaymentsEnabled" BOOLEAN NOT NULL DEFAULT false');
    expect(migration).toContain('ADD COLUMN "provider" "PaymentProvider"');
    expect(migration).not.toMatch(/DROP TABLE|TRUNCATE|DELETE FROM/iu);
  });

  it('protege credenciais e relações compostas', () => {
    expect(migration).toContain('store_payment_provider_connections_token_pairs_check');
    expect(migration).toContain('payment_provider_oauth_attempts_verifier_pair_check');
    expect(migration).toContain('mercado_pago_payments_email_pair_check');
    expect(migration).toContain('mercado_pago_payments_orderId_tenantId_storeId_fkey');
    expect(migration).toContain('mercado_pago_payments_connectionId_tenantId_storeId_fkey');
  });

  it('habilita RLS e revoga as três tabelas sensíveis e os eventos', () => {
    for (const table of [
      'store_payment_provider_connections',
      'payment_provider_oauth_attempts',
      'mercado_pago_payments',
      'payment_provider_webhook_events',
    ]) {
      expect(migration).toContain(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`);
      expect(migration).toContain(`REVOKE ALL ON TABLE "${table}" FROM anon`);
      expect(migration).toContain(`REVOKE ALL ON TABLE "${table}" FROM authenticated`);
    }
  });

  it('não persiste payload bruto ou QR base64', () => {
    expect(migration).not.toMatch(/rawJson|rawPayload|qrCodeBase64|qr_code_base64/iu);
  });
});

describe('migration de integridade dos pagamentos online', () => {
  it('cria reserva de cupom, inbox processável e alertas duráveis', () => {
    expect(integrityMigration).toContain('CREATE TABLE "coupon_reservations"');
    expect(integrityMigration).toContain('ADD COLUMN "providerObjectId"');
    expect(integrityMigration).toContain('ADD COLUMN "attempts"');
    expect(integrityMigration).toContain('CREATE TABLE "payment_provider_alerts"');
    expect(integrityMigration).toContain('ADD COLUMN "operationalStartedAt"');
  });

  it('permanece aditiva e protege as novas tabelas internas', () => {
    expect(integrityMigration).toContain('BEGIN;');
    expect(integrityMigration).toContain('COMMIT;');
    expect(integrityMigration).not.toMatch(/DROP TABLE|TRUNCATE|DELETE FROM/iu);
    for (const table of ['coupon_reservations', 'payment_provider_alerts']) {
      expect(integrityMigration).toContain(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`);
      expect(integrityMigration).toContain(`REVOKE ALL ON TABLE "${table}" FROM anon`);
      expect(integrityMigration).toContain(`REVOKE ALL ON TABLE "${table}" FROM authenticated`);
    }
  });
});

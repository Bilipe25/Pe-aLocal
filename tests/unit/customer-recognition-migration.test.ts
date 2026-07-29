import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const migration = (directory: string, file = 'migration.sql') =>
  readFileSync(resolve(`prisma/migrations/${directory}/${file}`), 'utf8');

const expand = migration('20260729100000_customer_recognition_expand');
const backfill = migration('20260729101000_customer_recognition_backfill');
const indexes = migration('20260729102000_customer_recognition_indexes');
const guard = migration('20260729103000_customer_recognition_guard');
const rollback = migration('20260729100000_customer_recognition_expand', 'rollback.sql');
const deviceRecognition = migration('20260729120000_storefront_device_recognition');
const deviceRollback = migration('20260729120000_storefront_device_recognition', 'rollback.sql');
const rollout = readFileSync(resolve('docs/customer-recognition-rollout.md'), 'utf8');

describe('customer recognition migrations', () => {
  it('expande o schema sem tratar reconhecimento como autenticação', () => {
    expect(expand.trimStart()).toMatch(/^-- Customer recognition v1:[\s\S]*BEGIN;/);
    expect(expand.trimEnd()).toMatch(/COMMIT;$/);
    expect(expand).toContain('ADD COLUMN "phoneNormalized" VARCHAR(13)');
    expect(expand).toContain('ADD COLUMN "recognitionEnabled" BOOLEAN NOT NULL DEFAULT false');
    expect(expand).toContain('CREATE TABLE "checkout_recognition_sessions"');
    expect(expand).toContain('CREATE TABLE "checkout_recognition_address_references"');
    expect(expand).toContain('CREATE TABLE "customer_recognition_throttles"');
    expect(expand).toContain('"tokenHash" CHAR(64) NOT NULL');
    expect(expand).toContain('"referenceHash" CHAR(64) NOT NULL');
    expect(expand).toContain('"customer_recognition_throttles_scope_check"');
    expect(expand).toContain('"customer_recognition_throttles_tenantId_fkey"');
    expect(expand).toContain('"customer_recognition_throttles_tenantId_scope_keyHash_key"');
    expect(expand).toContain('ON "customer_recognition_throttles"("tenantId", "scope", "keyHash")');
    expect(expand).not.toContain(
      '"customer_recognition_throttles_tenantId_storeId_scope_keyHash_key"',
    );
    expect(expand).not.toMatch(/"(?:token|reference)" TEXT/);
  });

  it('protege as tabelas efêmeras da Data API', () => {
    for (const table of [
      'customer_address_store_uses',
      'checkout_recognition_sessions',
      'checkout_recognition_address_references',
      'customer_recognition_throttles',
    ]) {
      expect(expand).toContain(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`);
      expect(expand).toContain(`REVOKE ALL ON TABLE "${table}" FROM anon, authenticated`);
    }
    expect(expand).toContain('REVOKE ALL ON FUNCTION public."_enforce_order_customer_tenant"()');
  });

  it('recusa ambiguidades antes de ativar clientes legados', () => {
    expect(backfill).toContain('invalid legacy phone exists');
    expect(backfill).toContain('normalized phone duplicates exist inside a tenant');
    expect(backfill).toContain('duplicate legacy customer addresses exist');
    expect(backfill).toContain('multiple default addresses exist for a customer');
    expect(backfill).toContain('an order references a customer from another tenant');
    expect(backfill).toContain('"recognitionEnabled" = true');
    expect(backfill).not.toMatch(/DELETE FROM "customers"/);
    expect(backfill).not.toMatch(/DELETE FROM "customer_addresses"/);
  });

  it('usa o mesmo fingerprint canônico documentado', () => {
    expect(backfill).toContain("normalize(COALESCE(street, ''), NFKD)");
    expect(backfill).toContain('pg_catalog.chr(31)');
    expect(backfill).toContain('pg_catalog.sha256');
    expect(backfill).toContain("'hex'");
    expect(rollout).toContain('street␟number␟complement␟neighborhood␟city␟state␟zipCode');
    expect(rollout).toContain('`label` e');
  });

  it('isola todos os índices de legado em operações concorrentes', () => {
    expect(indexes).not.toMatch(/\b(?:BEGIN|COMMIT)\b/);
    expect(indexes.match(/CREATE (?:UNIQUE )?INDEX CONCURRENTLY/g)).toHaveLength(6);
    expect(indexes).toContain('"customers_tenantId_phoneNormalized_key"');
    expect(indexes).toContain('"customer_addresses_one_default_per_customer_key"');
    expect(indexes).toContain('WHERE "isDefault"');
  });

  it('fecha integridade por tenant e permite CEP opcional sem taxa desconhecida', () => {
    expect(guard).toContain('VALIDATE CONSTRAINT "customers_phone_normalized_format_check"');
    expect(guard).toContain('ALTER COLUMN "phoneNormalized" SET NOT NULL');
    expect(guard).toContain('"customer_addresses_customerId_tenantId_fkey"');
    expect(guard).toContain('"customer_address_store_uses_customerAddressId_tenantId_fkey"');
    expect(guard).toContain('CREATE FUNCTION public."_enforce_recognition_reference_scope"()');
    expect(expand).toContain('CREATE TRIGGER "orders_customer_tenant_integrity"');
    expect(expand).toMatch(
      /"deliveryPostalCode" IS NULL\s+OR "deliveryPostalCode" ~ '\^\[0-9\]\{8\}\$'/,
    );
  });

  it('persiste confirmação explícita no servidor', () => {
    expect(expand).toContain('CREATE TYPE "CheckoutRecognitionConfirmationMode"');
    expect(expand).toContain('"confirmedAt" TIMESTAMP(3)');
    expect(expand).toContain('"confirmationMode" "CheckoutRecognitionConfirmationMode"');
    expect(expand).toContain('"checkout_recognition_sessions_confirmation_check"');
  });

  it('documenta rollback operacional e bloqueia perda de pedidos sem CEP', () => {
    expect(rollout).toContain('rollback operacional preferido');
    expect(rollback).toContain('delivery orders without postal code exist');
    expect(rollback).toContain('DROP TABLE IF EXISTS "checkout_recognition_sessions"');
    expect(rollback).toContain('ADD CONSTRAINT "customer_addresses_customerId_fkey"');
    expect(rollback.trimEnd()).toMatch(/COMMIT;$/);
  });

  it('adiciona reconhecimento por aparelho sem PII e com escopo de loja', () => {
    expect(deviceRecognition.trimStart()).toMatch(
      /^-- Persistent storefront device recognition\.[\s\S]*BEGIN;/,
    );
    expect(deviceRecognition).toContain('CREATE TABLE "storefront_devices"');
    expect(deviceRecognition).toContain('CREATE TABLE "customer_device_recognitions"');
    expect(deviceRecognition).toContain('"tokenHash" CHAR(64) NOT NULL');
    expect(deviceRecognition).toContain(
      '"customer_device_recognitions_storefrontDeviceId_storeId_key"',
    );
    expect(deviceRecognition).toContain(
      'CREATE FUNCTION public."_enforce_device_recognition_session_scope"()',
    );
    for (const table of ['storefront_devices', 'customer_device_recognitions']) {
      expect(deviceRecognition).toContain(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`);
      expect(deviceRecognition).toContain(
        `REVOKE ALL ON TABLE "${table}" FROM anon, authenticated`,
      );
    }
    expect(deviceRecognition).not.toMatch(/phone|address|customerName/i);
    expect(deviceRollback).toContain('Prefer deploying the previous application');
    expect(deviceRollback).toContain('DROP TABLE IF EXISTS "customer_device_recognitions"');
    expect(deviceRollback).toContain('DROP TABLE IF EXISTS "storefront_devices"');
  });
});

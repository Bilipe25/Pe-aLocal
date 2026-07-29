import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const preflight = readFileSync(resolve('tools/customer-recognition-preflight.mjs'), 'utf8');

describe('customer recognition preflight', () => {
  it('executa em snapshot read-only antes e depois das migrations', () => {
    expect(preflight).toContain('BEGIN TRANSACTION READ ONLY');
    expect(preflight).toContain("process.argv.includes('--before-migrate')");
    expect(preflight).toContain("phase: 'before_migrate'");
    expect(preflight).toContain("phase: 'after_migrate'");
    expect(preflight).toContain("await client.query('ROLLBACK')");
  });

  it('bloqueia ambiguidades e violações de isolamento sem imprimi-las', () => {
    expect(preflight).toContain('invalid_legacy_customer_phone');
    expect(preflight).toContain('duplicate_legacy_normalized_customer_phone');
    expect(preflight).toContain('duplicate_legacy_customer_address');
    expect(preflight).toContain('multiple_legacy_default_addresses');
    expect(preflight).toContain('order_customer_tenant_mismatch');
    expect(preflight).toContain('customer_address_store_use_scope_mismatch');
    expect(preflight).toContain('customer_device_recognition_scope_mismatch');
    expect(preflight).toContain('recognition_session_device_scope_mismatch');
    expect(preflight).toContain('customer_device_recognition_limit_exceeded');
    expect(preflight).not.toMatch(/array_agg\s*\(\s*(?:customer|address|orders)\./i);
  });

  it('valida índices, constraints, RLS e grants defensivos', () => {
    expect(preflight).toContain('indisready');
    expect(preflight).toContain('indisvalid');
    expect(preflight).toContain('constraints_not_validated');
    expect(preflight).toContain('recognition_rls_disabled');
    expect(preflight).toContain('recognition_direct_grant_present');
    expect(preflight).toContain("grantee IN ('anon', 'authenticated')");
    expect(preflight).toContain("'storefront_devices'");
    expect(preflight).toContain("'customer_device_recognitions'");
  });
});

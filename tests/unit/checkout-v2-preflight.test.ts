import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const preflight = readFileSync(resolve('tools/checkout-v2-preflight.mjs'), 'utf8');
const deployWorkflow = readFileSync(resolve('.github/workflows/deploy.yml'), 'utf8');

describe('checkout v2 rollout preflight', () => {
  it('usa transação somente leitura e bloqueia cobertura ou invariantes incompletas', () => {
    expect(preflight).toContain('BEGIN TRANSACTION READ ONLY');
    expect(preflight).toContain('delivery_coverage_missing');
    expect(preflight).toContain('active_coupon_without_store');
    expect(preflight).toContain('public_token_expiry_index_invalid');
    expect(preflight).toContain('constraints_not_validated');
    expect(preflight).not.toMatch(/customerName|customerPhone|deliveryAddress|pixKey/);
  });

  it('executa preflight e workerd antes do deploy da aplicação em staging', () => {
    const migration = deployWorkflow.indexOf('pnpm db:deploy');
    const preflightStep = deployWorkflow.indexOf('pnpm db:checkout-v2:preflight');
    const workerd = deployWorkflow.indexOf('pnpm test:workerd');
    const applicationDeploy = deployWorkflow.indexOf('opennextjs-cloudflare deploy');

    expect(migration).toBeGreaterThan(-1);
    expect(preflightStep).toBeGreaterThan(migration);
    expect(workerd).toBeGreaterThan(preflightStep);
    expect(applicationDeploy).toBeGreaterThan(workerd);
    expect(deployWorkflow).toContain("E2E_ALLOW_MUTATIONS: 'true'");
  });
});

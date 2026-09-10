import { describe, expect, it } from 'vitest';

import { parseCustomerRelationshipBackfillOptions } from '../../tools/customer-relationship-backfill';

const tenantId = '00000000-0000-4000-8000-000000000001';
const storeId = '00000000-0000-4000-8000-000000000002';

describe('customer relationship backfill guardrails', () => {
  it('é dry-run por padrão e exige escopo explícito', () => {
    expect(
      parseCustomerRelationshipBackfillOptions([`--tenant=${tenantId}`, `--store=${storeId}`]),
    ).toEqual({
      apply: false,
      tenantId,
      storeId,
      batchSize: 500,
      maxBatches: 20,
    });
  });

  it('limita o lote e rejeita argumentos desconhecidos', () => {
    expect(() =>
      parseCustomerRelationshipBackfillOptions([
        `--tenant=${tenantId}`,
        `--store=${storeId}`,
        '--batch-size=5000',
      ]),
    ).toThrow('invalid_batch_size');
    expect(() =>
      parseCustomerRelationshipBackfillOptions([
        `--tenant=${tenantId}`,
        `--store=${storeId}`,
        '--dangerously-ignore-scope',
      ]),
    ).toThrow('unknown_argument');
  });
});

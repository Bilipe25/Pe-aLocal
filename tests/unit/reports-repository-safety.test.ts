import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const repository = readFileSync(
  join(process.cwd(), 'src/server/repositories/reports.repository.ts'),
  'utf8',
);

describe('isolamento das consultas de relatórios', () => {
  it('ancora agregações no tenant, loja e início operacional', () => {
    expect(repository.match(/scope\.tenantId/g)?.length).toBeGreaterThanOrEqual(7);
    expect(repository.match(/scope\.storeId/g)?.length).toBeGreaterThanOrEqual(7);
    expect(repository.match(/operationalStartedAt/g)?.length).toBeGreaterThanOrEqual(12);
    expect(repository).not.toContain('createdAt" >=');
  });

  it('não projeta dados pessoais e restringe receita/produtos a concluídos e pagos', () => {
    expect(repository).not.toMatch(
      /customerName|customerPhone|deliveryAddress|deliveryStreet|notes/,
    );
    expect(repository.match(/"status" = 'DELIVERED'/g)?.length).toBeGreaterThanOrEqual(3);
    expect(repository.match(/"paymentStatus" = 'PAID'/g)?.length).toBeGreaterThanOrEqual(3);
    expect(repository).toContain('SUM(items."quantity")');
  });
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const repository = readFileSync(
  join(process.cwd(), 'src/server/repositories/reports.repository.ts'),
  'utf8',
);

describe('isolamento das consultas de relatórios V2', () => {
  it('ancora agregações no tenant, loja e início operacional', () => {
    expect(repository.match(/scope\.tenantId/g)?.length).toBeGreaterThanOrEqual(7);
    expect(repository.match(/scope\.storeId/g)?.length).toBeGreaterThanOrEqual(7);
    expect(repository.match(/operationalStartedAt/g)?.length).toBeGreaterThanOrEqual(12);
    expect(repository).not.toContain('createdAt" >=');
    expect(repository).toContain('GROUP BY 1');
    expect(repository).not.toContain('GROUP BY ${bucket}');
  });

  it('não projeta dados pessoais e restringe receita/produtos a concluídos e pagos', () => {
    expect(repository).not.toMatch(
      /customerName|customerPhone|deliveryAddress|deliveryStreet|notes/,
    );
    expect(repository.match(/"status" = 'DELIVERED'/g)?.length).toBeGreaterThanOrEqual(3);
    expect(repository.match(/"paymentStatus" = 'PAID'/g)?.length).toBeGreaterThanOrEqual(3);
    expect(repository).toContain('SUM("quantity")');
    expect(repository).toContain('ARRAY_AGG');
    expect(repository).toContain('ORDER BY ("period" = \'current\') DESC');
    expect(repository).not.toMatch(/products\."active"|products\."deletedAt"/);
    expect(repository).toContain('COUNT(DISTINCT alerts."orderId")');
    expect(repository).toContain('orders."tenantId" = alerts."tenantId"');
    expect(repository).toContain('orders."storeId" = alerts."storeId"');
  });
});

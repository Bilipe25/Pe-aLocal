import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(process.cwd(), 'prisma/migrations/20260722023000_order_transactional_outbox/migration.sql'),
  'utf8',
);

describe('order outbox migration', () => {
  it('é atômica e usa lock timeout limitado', () => {
    expect(migration.trimStart()).toMatch(/^BEGIN;/);
    expect(migration).toContain("SET LOCAL lock_timeout = '5s'");
    expect(migration.trimEnd()).toMatch(/COMMIT;[\s\S]*rollback/i);
  });

  it('impede referências cruzadas entre tenant, loja e pedido', () => {
    expect(migration).toContain('CREATE UNIQUE INDEX "orders_id_tenantId_storeId_key"');
    expect(migration).toContain('ON public.orders(id, "tenantId", "storeId")');
    expect(migration).toContain('CONSTRAINT "order_outbox_events_storeId_tenantId_fkey"');
    expect(migration).toContain('CONSTRAINT "order_outbox_events_orderId_tenantId_storeId_fkey"');
    expect(migration).toContain('FOREIGN KEY ("storeId", "tenantId")');
    expect(migration).toContain('FOREIGN KEY ("orderId", "tenantId", "storeId")');
  });

  it('protege a Data API e indexa o relay', () => {
    expect(migration).toContain('ENABLE ROW LEVEL SECURITY');
    expect(migration).toContain('REVOKE ALL ON TABLE public.order_outbox_events FROM anon');
    expect(migration).toContain(
      'REVOKE ALL ON TABLE public.order_outbox_events FROM authenticated',
    );
    expect(migration).toContain(
      'ON public.order_outbox_events(status, "availableAt", "createdAt")',
    );
  });
});

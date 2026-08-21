import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  'prisma/migrations/20260821073000_offers_v2_hardening/migration.sql',
  'utf8',
);

describe('migration de ofertas V2', () => {
  it('é aditiva, faz backfill e mantém as tabelas V1', () => {
    expect(migration).toContain('CREATE TABLE "store_offers"');
    expect(migration).toContain('FROM "store_combos"');
    expect(migration).toContain('FROM "store_product_promotions"');
    expect(migration).not.toMatch(/DROP TABLE\s+"store_(combos|product_promotions)"/u);
  });

  it('reforça pertencimento ao pedido e escopo tenant/store', () => {
    expect(migration).toContain('Snapshot de oferta associado a pedido diferente');
    expect(migration).toContain('order_items_offerGroupId_orderId_fkey');
    expect(migration).toContain('order_price_adjustments_orderItemId_orderId_fkey');
    expect(migration).toContain('store_offer_combo_choices_product_scope_fkey');
  });

  it('protege as novas tabelas com RLS e revoga acesso direto', () => {
    expect(migration).toContain('ALTER TABLE "store_offers" ENABLE ROW LEVEL SECURITY');
    expect(migration).toContain("'store_offer_usages'");
    expect(migration).toContain('REVOKE ALL ON TABLE');
  });
});

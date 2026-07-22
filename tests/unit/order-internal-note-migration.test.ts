import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  resolve('prisma/migrations/20260722213000_order_internal_notes/migration.sql'),
  'utf8',
);

describe('migration de observações internas', () => {
  it('cria tabela aditiva, escopo composto e índices sem remover legado', () => {
    expect(sql).toContain('CREATE TABLE "order_internal_notes"');
    expect(sql).toContain('FOREIGN KEY ("orderId", "tenantId", "storeId")');
    expect(sql).toContain('REFERENCES "orders"("id", "tenantId", "storeId")');
    expect(sql).toContain('order_internal_notes_orderId_createdAt_id_idx');
    expect(sql).toContain("ADD VALUE IF NOT EXISTS 'ORDER_INTERNAL_NOTE_ADDED'");
    const executableSql = sql
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('--'))
      .join('\n');
    expect(executableSql).not.toMatch(/DROP\s+(TABLE|COLUMN)/i);
  });
});

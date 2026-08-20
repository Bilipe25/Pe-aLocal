import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  'prisma/migrations/20260820210000_dining_table_sessions_v2/migration.sql',
  'utf8',
);

describe('migration V2 da gestão da mesa', () => {
  it('é aditiva e impõe uma única sessão OPEN por mesa', () => {
    expect(migration).toContain('CREATE TABLE "dining_table_sessions"');
    expect(migration).toContain('"dining_table_sessions_one_open_per_table"');
    expect(migration).toContain('WHERE "status" = \'OPEN\'');
    expect(migration).toContain('ADD COLUMN "diningTableSessionId" TEXT');
    expect(migration).not.toMatch(/DROP\s+(TABLE|COLUMN)/iu);
  });

  it('deduplica requests abertos, protege escopo e revoga acesso direto', () => {
    expect(migration).toContain('"dining_table_service_requests_one_open_per_type"');
    expect(migration).toContain('ENABLE ROW LEVEL SECURITY');
    expect(migration).toContain('REVOKE ALL ON TABLE "dining_table_sessions" FROM anon');
    expect(migration).toContain('"orders_dining_table_session_shape_check"');
  });
});

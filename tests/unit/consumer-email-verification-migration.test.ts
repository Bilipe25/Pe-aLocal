import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(
    process.cwd(),
    'prisma/migrations/20260825120000_consumer_identity_email_verification/migration.sql',
  ),
  'utf8',
);

describe('consumer email verification migration', () => {
  it('is additive for stored identities, sessions and commercial data', () => {
    expect(migration).toContain('ADD COLUMN "emailNormalized" VARCHAR(254)');
    expect(migration).toContain('ADD COLUMN "emailVerifiedAt" TIMESTAMP(3)');
    expect(migration).toContain('ADD COLUMN "otpHash" CHAR(64)');
    expect(migration).toContain('ALTER COLUMN "phoneNormalized" DROP NOT NULL');
    expect(migration).not.toMatch(/DROP\s+(?:TABLE|COLUMN)/iu);
    expect(migration).not.toMatch(/\b(?:DELETE|TRUNCATE)\b/iu);
  });

  it('keeps Bird separate and requires an email HMAC for new local-code providers', () => {
    expect(migration).toContain('"provider" = \'bird\'');
    expect(migration).toContain("\"provider\" IN ('resend', 'development')");
    expect(migration).toContain('"emailNormalized" IS NOT NULL');
    expect(migration).toContain('"otpHash" IS NOT NULL');
    expect(migration).toContain('"otpHash" ~ \'^[a-f0-9]{64}$\'');
  });

  it('adds normalized global email uniqueness and tenant/store challenge lookup', () => {
    expect(migration).toContain('consumer_identities_emailNormalized_key');
    expect(migration).toContain('consumer_verification_challenges_scope_email_idx');
    expect(migration).toContain('"emailNormalized" = lower("emailNormalized")');
  });
});

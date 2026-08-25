import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const baseEnv = {
  DATABASE_URL: 'postgresql://user:password@localhost:5432/app',
  DIRECT_URL: 'postgresql://user:password@localhost:5432/app',
  NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
  APP_URL: 'http://localhost:3000',
  NODE_ENV: 'test',
  CONSUMER_VERIFICATION_PROVIDER: 'disabled',
  BIRD_API_KEY: '',
} as const;

async function loadEnv(overrides: Record<string, string> = {}) {
  for (const [key, value] of Object.entries({ ...baseEnv, ...overrides })) {
    vi.stubEnv(key, value);
  }
  const { getEnv } = await import('@/config/env');
  return getEnv();
}

describe('consumer verification environment', () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.unstubAllEnvs());

  it('allows the provider to remain safely disabled without a Bird key', async () => {
    await expect(loadEnv()).resolves.toMatchObject({
      CONSUMER_VERIFICATION_PROVIDER: 'disabled',
      BIRD_API_KEY: undefined,
    });
  });

  it('accepts a current regional Bird API key', async () => {
    await expect(
      loadEnv({
        CONSUMER_VERIFICATION_PROVIDER: 'bird',
        BIRD_API_KEY: 'bk_us1_Ab3xKq9mP2wR5tY8uI1oL4nJ2kQ9m',
      }),
    ).resolves.toMatchObject({ CONSUMER_VERIFICATION_PROVIDER: 'bird' });
  });

  it('rejects Bird mode without the current API key', async () => {
    await expect(loadEnv({ CONSUMER_VERIFICATION_PROVIDER: 'bird' })).rejects.toThrow(
      'BIRD_API_KEY: é obrigatória',
    );
  });

  it('rejects malformed or non-regional Bird keys', async () => {
    await expect(
      loadEnv({ CONSUMER_VERIFICATION_PROVIDER: 'bird', BIRD_API_KEY: 'legacy-access-key' }),
    ).rejects.toThrow('BIRD_API_KEY: deve ser uma API key Bird regional');
  });
});

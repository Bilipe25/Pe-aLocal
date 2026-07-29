import { afterEach, describe, expect, it, vi } from 'vitest';

import { isDeployedRuntime } from '@/server/runtime-environment';

describe('isDeployedRuntime', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each(['staging', 'production'] as const)(
    'mantém o modo estrito no build implantado de %s',
    (appEnvironment) => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('APP_ENV', appEnvironment);

      expect(isDeployedRuntime()).toBe(true);
    },
  );

  it('não confunde next dev apontado para staging com um deploy Cloudflare', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('APP_ENV', 'staging');

    expect(isDeployedRuntime()).toBe(false);
  });

  it('não trata testes com variáveis de staging como um deploy', () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('APP_ENV', 'staging');

    expect(isDeployedRuntime()).toBe(false);
  });
});

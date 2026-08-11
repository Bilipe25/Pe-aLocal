import { beforeEach, describe, expect, it, vi } from 'vitest';

import { applyMerchantBadge } from '@/lib/web-push/merchant-badge';

describe('badge operacional', () => {
  const setAppBadge = vi.fn().mockResolvedValue(undefined);
  const clearAppBadge = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperties(navigator, {
      setAppBadge: { configurable: true, value: setAppBadge },
      clearAppBadge: { configurable: true, value: clearAppBadge },
    });
  });

  it.each([1, 2])('aplica a quantidade agregada %s', async (count) => {
    await applyMerchantBadge(count);
    expect(setAppBadge).toHaveBeenCalledWith(count);
    expect(clearAppBadge).not.toHaveBeenCalled();
  });

  it('limpa o badge quando nÃ£o hÃ¡ pedidos acionÃ¡veis', async () => {
    await applyMerchantBadge(0);
    expect(clearAppBadge).toHaveBeenCalledOnce();
    expect(setAppBadge).not.toHaveBeenCalled();
  });
});

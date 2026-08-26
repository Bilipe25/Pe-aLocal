import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { StoreEntitlementInput } from '@/schemas/store-entitlement';

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  updateStoreEntitlement: vi.fn(),
  updateTag: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
  updateTag: mocks.updateTag,
}));
vi.mock('@/server/services/store-entitlement.service', () => ({
  updateStoreEntitlement: mocks.updateStoreEntitlement,
}));

import { updateStoreEntitlementAction } from '@/features/entitlements/actions';

describe('actions de entitlement da loja', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateStoreEntitlement.mockResolvedValue({ storeSlug: 'loja-a' });
  });

  it('invalida capabilities públicas depois da atualização do Super Admin', async () => {
    const result = await updateStoreEntitlementAction(
      'tenant-a',
      'store-a',
      {} as StoreEntitlementInput,
    );

    expect(result.success).toBe(true);
    expect(mocks.updateTag).toHaveBeenCalledWith('store-capabilities:store-a');
  });
});

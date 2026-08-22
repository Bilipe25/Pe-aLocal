import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireActiveStoreContext: vi.fn(),
  transaction: vi.fn(),
  findScopedProducts: vi.fn(),
  findScopedCombo: vi.fn(),
  createScopedCombo: vi.fn(),
  replaceScopedCombo: vi.fn(),
  createAuditLog: vi.fn(),
  storeOfferCreate: vi.fn(),
  storeOfferUpdate: vi.fn(),
}));

vi.mock('@/server/database/client', () => ({
  getDb: () => ({ $transaction: mocks.transaction }),
}));
vi.mock('@/server/services/store-context.service', () => ({
  requireActiveStoreContext: mocks.requireActiveStoreContext,
}));
vi.mock('@/server/repositories/audit-log.repository', () => ({
  createAuditLog: mocks.createAuditLog,
}));
vi.mock('@/server/repositories/offer.repository', () => ({
  findScopedProducts: mocks.findScopedProducts,
  findScopedCombo: mocks.findScopedCombo,
  createScopedCombo: mocks.createScopedCombo,
  replaceScopedCombo: mocks.replaceScopedCombo,
}));

import {
  createComboForActiveStore,
  updateComboForActiveStore,
} from '@/server/services/offer.service';

const tenantId = '00000000-0000-0000-0000-000000000001';
const storeId = '7a053488-39a2-41d5-bb53-042a7347858b';
const userId = '3703e18e-d53b-46df-9f07-6a6ee9f07d9d';
const comboId = '10000000-0000-4000-8000-000000000100';
const productIds = ['00000000-0000-0000-0002-000000000001', '00000000-0000-0000-0002-000000000005'];
const products = [
  {
    id: productIds[0],
    name: 'X-Burger',
    basePrice: 2490,
    isAvailable: true,
    isSoldOut: false,
    archivedAt: null,
    version: 0,
  },
  {
    id: productIds[1],
    name: 'Coca-Cola',
    basePrice: 500,
    isAvailable: true,
    isSoldOut: false,
    archivedAt: null,
    version: 0,
  },
];
const parsedItems = productIds.map((productId, position) => ({
  id: `10000000-0000-4000-8000-00000000010${position}`,
  productId,
  quantity: 1,
  position,
  product: products[position],
}));
const comboRecord = {
  id: comboId,
  tenantId,
  storeId,
  name: 'Combo clássico',
  description: null,
  specialPrice: 2000,
  isActive: true,
  sortOrder: 0,
  version: 0,
  startsOn: null,
  endsOnExclusive: null,
  weekdays: [],
  startMinute: null,
  endMinuteExclusive: null,
  archivedAt: null,
  createdAt: new Date('2026-08-22T00:00:00.000Z'),
  updatedAt: new Date('2026-08-22T00:00:00.000Z'),
  items: parsedItems,
};
const input = {
  name: 'Combo clássico',
  description: '',
  specialPrice: 20,
  isActive: true,
  sortOrder: 0,
  items: productIds.map((productId) => ({ productId, quantity: 1 })),
  startsOn: '',
  endsOnExclusive: '',
  weekdays: [],
  startTime: '',
  endTimeExclusive: '',
};

describe('gravação de combos legados', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireActiveStoreContext.mockResolvedValue({
      session: { tenantId, userId },
      store: {
        id: storeId,
        slug: 'burger-do-ze',
        entitlement: { combosPromotionsEnabled: true },
      },
    });
    mocks.findScopedProducts.mockResolvedValue(products);
    mocks.createScopedCombo.mockResolvedValue(comboRecord);
    mocks.replaceScopedCombo.mockResolvedValue({ ...comboRecord, version: 1 });
    mocks.findScopedCombo.mockResolvedValue(comboRecord);
    mocks.createAuditLog.mockResolvedValue(undefined);
    mocks.storeOfferCreate.mockResolvedValue({ id: comboId });
    mocks.storeOfferUpdate.mockResolvedValue({ id: comboId });
    const tx = {
      storeOffer: { create: mocks.storeOfferCreate, update: mocks.storeOfferUpdate },
    };
    mocks.transaction.mockImplementation(async (operation: (client: typeof tx) => unknown) =>
      operation(tx),
    );
  });

  it('deixa o Prisma herdar tenant e loja ao criar itens aninhados', async () => {
    await createComboForActiveStore(input);

    expect(mocks.createScopedCombo).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tenantId,
        storeId,
        items: {
          createMany: {
            data: [
              { productId: productIds[0], quantity: 1, position: 0 },
              { productId: productIds[1], quantity: 1, position: 1 },
            ],
          },
        },
      }),
    );
  });

  it('não repete tenant e loja ao recriar itens na atualização', async () => {
    await updateComboForActiveStore(comboId, 0, input);

    expect(mocks.replaceScopedCombo).toHaveBeenCalledWith(
      expect.anything(),
      comboId,
      expect.anything(),
      [
        { productId: productIds[0], quantity: 1, position: 0 },
        { productId: productIds[1], quantity: 1, position: 1 },
      ],
    );
  });
});

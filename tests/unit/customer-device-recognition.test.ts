import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getStorefrontDeviceExpiration,
  persistDeviceRecognitionAfterOrder,
} from '@/server/services/customer-device-recognition.service';

const now = new Date('2026-07-29T12:00:00.000Z');

function createTx() {
  return {
    customer: {
      findFirst: vi.fn().mockResolvedValue({ id: 'customer-a' }),
    },
    storefrontDevice: {
      upsert: vi.fn().mockResolvedValue({ id: 'device-a' }),
    },
    customerDeviceRecognition: {
      upsert: vi.fn().mockResolvedValue({ id: 'recognition-current' }),
      findMany: vi.fn().mockResolvedValue([{ id: 'recognition-current' }]),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  };
}

describe('reconhecimento persistente por aparelho', () => {
  beforeEach(() => vi.clearAllMocks());

  it('cria um vínculo loja-aparelho por 90 dias sem persistir o token bruto', async () => {
    const tx = createTx();
    const tokenHash = 'a'.repeat(64);

    const result = await persistDeviceRecognitionAfterOrder({
      tx: tx as never,
      tokenHash,
      tenantId: 'tenant-a',
      storeId: 'store-a',
      customerId: 'customer-a',
      now,
    });

    const expiresAt = getStorefrontDeviceExpiration(now);
    expect(result).toEqual({ remembered: true, expiresAt });
    expect(tx.storefrontDevice.upsert).toHaveBeenCalledWith({
      where: { tokenHash },
      create: { tokenHash, lastUsedAt: now, expiresAt },
      update: { lastUsedAt: now, expiresAt },
      select: { id: true },
    });
    expect(JSON.stringify(tx.storefrontDevice.upsert.mock.calls)).not.toContain(
      'pedidolocal_device',
    );
    expect(tx.customerDeviceRecognition.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          storefrontDeviceId_storeId: {
            storefrontDeviceId: 'device-a',
            storeId: 'store-a',
          },
        },
        create: expect.objectContaining({
          tenantId: 'tenant-a',
          storeId: 'store-a',
          customerId: 'customer-a',
        }),
      }),
    );
  });

  it('não cria vínculo para hash inválido ou reconhecimento desabilitado', async () => {
    const tx = createTx();

    await expect(
      persistDeviceRecognitionAfterOrder({
        tx: tx as never,
        tokenHash: 'token-bruto',
        tenantId: 'tenant-a',
        storeId: 'store-a',
        customerId: 'customer-a',
        now,
      }),
    ).resolves.toBeNull();
    expect(tx.storefrontDevice.upsert).not.toHaveBeenCalled();

    tx.customer.findFirst.mockResolvedValueOnce(null);
    await expect(
      persistDeviceRecognitionAfterOrder({
        tx: tx as never,
        tokenHash: 'b'.repeat(64),
        tenantId: 'tenant-a',
        storeId: 'store-a',
        customerId: 'customer-a',
        now,
      }),
    ).resolves.toBeNull();
    expect(tx.storefrontDevice.upsert).not.toHaveBeenCalled();
  });

  it('mantém no máximo cinco aparelhos ativos por consumidor e loja', async () => {
    const tx = createTx();
    tx.customerDeviceRecognition.findMany.mockResolvedValue([
      { id: 'recognition-current' },
      { id: 'recognition-2' },
      { id: 'recognition-3' },
      { id: 'recognition-4' },
      { id: 'recognition-5' },
      { id: 'recognition-oldest' },
    ]);

    await persistDeviceRecognitionAfterOrder({
      tx: tx as never,
      tokenHash: 'c'.repeat(64),
      tenantId: 'tenant-a',
      storeId: 'store-a',
      customerId: 'customer-a',
      now,
    });

    expect(tx.customerDeviceRecognition.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['recognition-oldest'] },
        tenantId: 'tenant-a',
        storeId: 'store-a',
        customerId: 'customer-a',
        revokedAt: null,
      },
      data: { revokedAt: now },
    });
  });
});

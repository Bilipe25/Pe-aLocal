import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ConflictError } from '@/server/errors';
import { Permission } from '@/server/permissions';
import {
  updateStoreAddressSettings,
  updateStoreOperationalSettings,
  updateStorePaymentSettings,
  updateStoreStatus,
} from '@/server/services/store-settings.service';

const mocks = vi.hoisted(() => {
  const tx = {
    store: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
    },
    storeSettings: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    storeAddress: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    openingHour: {
      findMany: vi.fn(),
      upsert: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  };

  return {
    tx,
    transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    requireTenantStoreAccess: vi.fn(),
    createAuditLog: vi.fn(),
  };
});

vi.mock('@/server/auth', () => ({
  requireTenantStoreAccess: mocks.requireTenantStoreAccess,
}));
vi.mock('@/server/database/client', () => ({
  getDb: () => ({ $transaction: mocks.transaction }),
}));
vi.mock('@/server/repositories/audit-log.repository', () => ({
  createAuditLog: mocks.createAuditLog,
}));
vi.mock('@/server/repositories/store.repository', () => ({
  findStoreBySlug: vi.fn(),
}));

const context = {
  session: {
    userId: 'user-owner',
    tenantId: 'tenant-a',
    tenantRole: 'OWNER',
  },
  store: {
    id: 'store-a',
    tenantId: 'tenant-a',
    slug: 'loja-a',
  },
};

describe('concorrência das configurações da loja', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireTenantStoreAccess.mockResolvedValue(context);
    mocks.tx.store.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.store.findFirst.mockResolvedValue({ status: 'OPEN' });
    mocks.tx.storeSettings.findUnique.mockResolvedValue(null);
    mocks.tx.storeAddress.findUnique.mockResolvedValue(null);
    mocks.createAuditLog.mockResolvedValue({ id: 'audit-a' });
  });

  it('incrementa a versão com escopo de tenant e audita na mesma transação', async () => {
    await expect(
      updateStoreOperationalSettings('store-a', 7, {
        minOrderValue: 20,
        estimatedTime: '30-50 min',
        deliveryEnabled: true,
        pickupEnabled: true,
        acceptsPix: true,
        acceptsCash: false,
        acceptsCardOnDelivery: true,
      }),
    ).resolves.toMatchObject({ storeId: 'store-a', configurationVersion: 8 });

    expect(mocks.requireTenantStoreAccess).toHaveBeenCalledWith(
      'store-a',
      Permission.EDIT_STORE_OPERATIONS,
    );
    expect(mocks.tx.store.updateMany).toHaveBeenCalledWith({
      where: { id: 'store-a', tenantId: 'tenant-a', configurationVersion: 7 },
      data: { configurationVersion: { increment: 1 } },
    });
    expect(mocks.tx.storeSettings.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ minOrderValue: 2000 }),
      }),
    );
    expect(mocks.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-a',
        storeId: 'store-a',
        userId: 'user-owner',
        action: 'UPDATE',
      }),
      mocks.tx,
    );
  });

  it('retorna conflito e não grava configuração nem auditoria quando a versão mudou', async () => {
    mocks.tx.store.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(
      updateStoreAddressSettings('store-a', 4, {
        street: 'Rua Um',
        number: '10',
        complement: '',
        neighborhood: 'Centro',
        city: 'Fortaleza',
        state: 'CE',
        zipCode: '60000-000',
      }),
    ).rejects.toEqual(
      new ConflictError(
        'As configurações foram alteradas em outra sessão. Recarregue a página antes de continuar.',
      ),
    );

    expect(mocks.tx.storeAddress.upsert).not.toHaveBeenCalled();
    expect(mocks.createAuditLog).not.toHaveBeenCalled();
  });

  it('nunca inclui a chave Pix nos metadados seguros de auditoria', async () => {
    mocks.tx.storeSettings.findUnique.mockResolvedValueOnce({
      pixKeyType: 'EMAIL',
      pixKey: 'chave-anterior@example.com',
      pixRecipient: 'Pedido Local',
      pixBank: 'Banco A',
      pixInstructions: 'Anterior',
    });

    await updateStorePaymentSettings('store-a', 2, {
      pixKeyType: 'RANDOM',
      pixKey: 'segredo-nao-pode-ir-para-auditoria',
      pixRecipient: 'Pedido Local',
      pixBank: 'Banco B',
      pixInstructions: 'Nova instrução',
    });

    const auditPayload = mocks.createAuditLog.mock.calls[0]?.[0];
    const serializedAudit = JSON.stringify(auditPayload);
    expect(serializedAudit).not.toContain('segredo-nao-pode-ir-para-auditoria');
    expect(serializedAudit).not.toContain('chave-anterior@example.com');
    expect(auditPayload).toMatchObject({
      metadata: {
        section: 'payments',
        previousPixKeyType: 'EMAIL',
        nextPixKeyType: 'RANDOM',
        pixKeyChanged: true,
      },
    });
  });

  it('protege mudança de status com versão e registra antes/depois', async () => {
    mocks.tx.store.findFirst.mockResolvedValueOnce({ status: 'OPEN' });

    await updateStoreStatus('store-a', 11, 'PAUSED');

    expect(mocks.tx.store.updateMany).toHaveBeenCalledWith({
      where: { id: 'store-a', tenantId: 'tenant-a', configurationVersion: 11 },
      data: { status: 'PAUSED', configurationVersion: { increment: 1 } },
    });
    expect(mocks.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'STATUS_CHANGE',
        metadata: expect.objectContaining({
          previousStatus: 'OPEN',
          nextStatus: 'PAUSED',
        }),
      }),
      mocks.tx,
    );
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BusinessRuleError, ConflictError } from '@/server/errors';
import { Permission } from '@/server/permissions';
import {
  removeStoreScheduleException,
  saveStoreScheduleException,
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
    storeScheduleException: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
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
    getStoreReadinessStateForTenant: vi.fn(),
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
vi.mock('@/server/services/store-readiness.service', () => ({
  getStoreReadinessForTenant: vi.fn(),
  getStoreReadinessStateForTenant: mocks.getStoreReadinessStateForTenant,
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
    status: 'CLOSED',
    timeZone: 'America/Fortaleza',
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
    mocks.tx.storeScheduleException.findUnique.mockResolvedValue(null);
    mocks.tx.storeScheduleException.upsert.mockResolvedValue({
      id: '4da03571-bffd-45ef-8c44-20686c487838',
    });
    mocks.createAuditLog.mockResolvedValue({ id: 'audit-a' });
    mocks.getStoreReadinessStateForTenant.mockResolvedValue({
      snapshot: { status: 'OPEN', configurationVersion: 11 },
      readiness: { isReady: true, blockers: [], warnings: [], issues: [] },
    });
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

  it('salva uma exceção com escopo de tenant, versão e auditoria atômica', async () => {
    await saveStoreScheduleException('store-a', 5, {
      date: '2026-12-25',
      type: 'CLOSED',
      reason: 'Natal',
    });

    expect(mocks.tx.storeScheduleException.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          tenantId: 'tenant-a',
          storeId: 'store-a',
          type: 'CLOSED',
          createdById: 'user-owner',
        }),
      }),
    );
    expect(mocks.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CREATE',
        entity: 'StoreScheduleException',
        metadata: expect.objectContaining({ date: '2026-12-25' }),
      }),
      mocks.tx,
    );
  });

  it('remove somente a exceção da loja e audita a exclusão', async () => {
    const exceptionId = '4da03571-bffd-45ef-8c44-20686c487838';
    mocks.tx.storeScheduleException.findFirst.mockResolvedValue({
      id: exceptionId,
      date: new Date('2026-12-25T00:00:00.000Z'),
      type: 'CLOSED',
      openTime: null,
      closeTime: null,
      reason: 'Natal',
    });

    await removeStoreScheduleException('store-a', 6, exceptionId);

    expect(mocks.tx.storeScheduleException.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: exceptionId, tenantId: 'tenant-a', storeId: 'store-a' },
      }),
    );
    expect(mocks.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'DELETE', entity: 'StoreScheduleException' }),
      mocks.tx,
    );
  });

  it('bloqueia abertura integralmente e audita somente os códigos das pendências', async () => {
    const blocker = {
      code: 'DELIVERY_ZONE_REQUIRED',
      severity: 'BLOCKER',
      title: 'Entrega sem zona ativa',
      description: 'Cadastre uma zona ativa.',
      actionHref: '/dashboard/delivery',
    };
    mocks.getStoreReadinessStateForTenant.mockResolvedValueOnce({
      snapshot: { status: 'CLOSED', configurationVersion: 11 },
      readiness: { isReady: false, blockers: [blocker], warnings: [], issues: [blocker] },
    });

    await expect(updateStoreStatus('store-a', 11, 'OPEN')).rejects.toMatchObject({
      code: 'BUSINESS_RULE_ERROR',
      message: 'A loja possui 1 pendência que impede a abertura.',
      details: [blocker],
    } satisfies Partial<BusinessRuleError>);

    expect(mocks.tx.store.updateMany).not.toHaveBeenCalled();
    expect(mocks.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'STATUS_CHANGE',
        metadata: {
          section: 'status',
          outcome: 'BLOCKED',
          requestedStatus: 'OPEN',
          configurationVersion: 11,
          blockerCodes: ['DELIVERY_ZONE_REQUIRED'],
        },
      }),
      mocks.tx,
    );
  });

  it('não audita tentativa de abertura com versão obsoleta', async () => {
    mocks.getStoreReadinessStateForTenant.mockResolvedValueOnce({
      snapshot: { status: 'CLOSED', configurationVersion: 12 },
      readiness: { isReady: true, blockers: [], warnings: [], issues: [] },
    });

    await expect(updateStoreStatus('store-a', 11, 'OPEN')).rejects.toBeInstanceOf(ConflictError);

    expect(mocks.tx.store.updateMany).not.toHaveBeenCalled();
    expect(mocks.createAuditLog).not.toHaveBeenCalled();
  });
});

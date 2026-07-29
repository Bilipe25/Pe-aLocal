import { describe, expect, it, vi } from 'vitest';

import {
  consumeRecognitionSession,
  createRecognitionSecret,
  hashRecognitionSecret,
  resolveActiveRecognitionSession,
  resolveConfirmedRecognition,
  resolveRecognitionAddressReference,
} from '@/server/services/customer-recognition.service';

const now = new Date('2026-07-29T15:00:00.000Z');
const browserToken = 't'.repeat(43);
const opaqueReference = 'r'.repeat(43);

async function validReference(overrides: Record<string, unknown> = {}) {
  return {
    id: 'reference-a',
    recognitionSessionId: 'session-a',
    tenantId: 'tenant-a',
    storeId: 'store-a',
    customerId: 'customer-a',
    addressUpdatedAt: new Date('2026-07-29T14:00:00.000Z'),
    expiresAt: new Date('2026-07-29T15:15:00.000Z'),
    invalidatedAt: null,
    consumedAt: null,
    confirmedAt: new Date('2026-07-29T14:59:00.000Z'),
    recognitionSession: {
      tokenHash: await hashRecognitionSecret(browserToken),
      customerId: 'customer-a',
      expiresAt: new Date('2026-07-29T15:15:00.000Z'),
      invalidatedAt: null,
      consumedAt: null,
      confirmedAt: new Date('2026-07-29T14:59:00.000Z'),
      confirmationMode: 'SAVED_ADDRESS',
    },
    customerAddress: {
      id: 'address-a',
      tenantId: 'tenant-a',
      customerId: 'customer-a',
      updatedAt: new Date('2026-07-29T14:00:00.000Z'),
      street: 'Rua das Flores',
      number: '182',
      complement: 'Apto 43',
      neighborhood: 'Centro',
      city: 'São Paulo',
      state: 'SP',
      zipCode: '01234567',
      reference: 'Portão azul',
      addressFingerprint: 'a'.repeat(64),
      storeUses: [{ deliveryZoneId: 'zone-a' }],
    },
    ...overrides,
  };
}

function fakeClient(reference: unknown) {
  return {
    checkoutRecognitionAddressReference: {
      findUnique: vi.fn().mockResolvedValue(reference),
      updateMany: vi.fn(),
    },
    checkoutRecognitionSession: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
    customerRecognitionThrottle: {},
    customer: {},
    customerAddress: {},
    deliveryZonePostalRange: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
    storeAddress: {
      findUnique: vi.fn().mockResolvedValue({ city: 'São Paulo', state: 'SP' }),
    },
    $executeRaw: vi.fn(),
  };
}

describe('referências opacas de endereço', () => {
  it('gera segredos de 256 bits sem incluir IDs de banco', () => {
    const first = createRecognitionSecret();
    const second = createRecognitionSecret();

    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(second).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(first).not.toBe(second);
  });

  it('resolve somente referência confirmada, atual, da mesma sessão, loja e tenant', async () => {
    const client = fakeClient(await validReference());
    const resolved = await resolveRecognitionAddressReference({
      tenantId: 'tenant-a',
      storeId: 'store-a',
      opaqueReference,
      browserToken,
      client: client as never,
      now,
    });

    expect(resolved).toMatchObject({
      referenceId: 'reference-a',
      sessionId: 'session-a',
      customerId: 'customer-a',
      mappedDeliveryZoneId: 'zone-a',
      address: {
        id: 'address-a',
        street: 'Rua das Flores',
        number: '182',
        addressFingerprint: 'a'.repeat(64),
      },
    });
    expect(resolved?.address).not.toHaveProperty('storeUses');
    expect(resolved?.address).not.toHaveProperty('tenantId');
    expect(resolved?.address).not.toHaveProperty('customerId');
  });

  it.each([
    ['outro tenant', { tenantId: 'tenant-b' }],
    ['outra loja', { storeId: 'store-b' }],
    ['referência expirada', { expiresAt: new Date('2026-07-29T14:59:59.000Z') }],
    ['referência não confirmada', { confirmedAt: null }],
    [
      'sessão sem confirmação',
      {
        recognitionSession: {
          tokenHash: '',
          customerId: 'customer-a',
          expiresAt: new Date('2026-07-29T15:15:00.000Z'),
          invalidatedAt: null,
          consumedAt: null,
          confirmedAt: null,
          confirmationMode: null,
        },
      },
    ],
  ])('rejeita %s', async (_case, overrides) => {
    const reference = await validReference(overrides);
    if ('recognitionSession' in overrides && overrides.recognitionSession) {
      (reference.recognitionSession as { tokenHash: string }).tokenHash =
        await hashRecognitionSecret(browserToken);
    }
    const resolved = await resolveRecognitionAddressReference({
      tenantId: 'tenant-a',
      storeId: 'store-a',
      opaqueReference,
      browserToken,
      client: fakeClient(reference) as never,
      now,
    });

    expect(resolved).toBeNull();
  });

  it('rejeita quando o endereço foi alterado depois da emissão da referência', async () => {
    const reference = await validReference();
    reference.customerAddress.updatedAt = new Date('2026-07-29T14:30:00.000Z');

    await expect(
      resolveRecognitionAddressReference({
        tenantId: 'tenant-a',
        storeId: 'store-a',
        opaqueReference,
        browserToken,
        client: fakeClient(reference) as never,
        now,
      }),
    ).resolves.toBeNull();
  });
});

describe('sessão confirmada do reconhecimento', () => {
  it('localiza sessão negativa/não confirmada apenas para invalidação pós-pedido', async () => {
    const client = fakeClient(null);
    client.checkoutRecognitionSession.findUnique.mockResolvedValue({
      id: 'session-a',
      tenantId: 'tenant-a',
      storeId: 'store-a',
      expiresAt: new Date('2026-07-29T15:15:00.000Z'),
      invalidatedAt: null,
      consumedAt: null,
    });

    await expect(
      resolveActiveRecognitionSession({
        tenantId: 'tenant-a',
        storeId: 'store-a',
        browserToken,
        client: client as never,
        now,
      }),
    ).resolves.toEqual({ sessionId: 'session-a' });
    await expect(
      resolveActiveRecognitionSession({
        tenantId: 'tenant-b',
        storeId: 'store-a',
        browserToken,
        client: client as never,
        now,
      }),
    ).resolves.toBeNull();
  });

  it('só libera vínculo depois da confirmação explícita', async () => {
    const client = fakeClient(null);
    client.checkoutRecognitionSession.findUnique.mockResolvedValue({
      id: 'session-a',
      tenantId: 'tenant-a',
      storeId: 'store-a',
      customerId: 'customer-a',
      expiresAt: new Date('2026-07-29T15:15:00.000Z'),
      invalidatedAt: null,
      consumedAt: null,
      confirmedAt: new Date('2026-07-29T15:00:00.000Z'),
      confirmationMode: 'NEW_ADDRESS',
      customer: {
        id: 'customer-a',
        tenantId: 'tenant-a',
        name: 'João Martins',
        phone: '(11) 99999-9999',
        phoneNormalized: '5511999999999',
        recognitionEnabled: true,
      },
    });

    await expect(
      resolveConfirmedRecognition({
        tenantId: 'tenant-a',
        storeId: 'store-a',
        browserToken,
        client: client as never,
        now,
      }),
    ).resolves.toEqual({
      sessionId: 'session-a',
      customerId: 'customer-a',
      confirmationMode: 'NEW_ADDRESS',
    });

    client.checkoutRecognitionSession.findUnique.mockResolvedValueOnce({
      id: 'session-a',
      tenantId: 'tenant-a',
      storeId: 'store-a',
      customerId: 'customer-a',
      expiresAt: new Date('2026-07-29T15:15:00.000Z'),
      invalidatedAt: null,
      consumedAt: null,
      confirmedAt: null,
      confirmationMode: null,
      customer: {
        id: 'customer-a',
        tenantId: 'tenant-a',
        name: 'João Martins',
        phone: '(11) 99999-9999',
        phoneNormalized: '5511999999999',
        recognitionEnabled: true,
      },
    });
    await expect(
      resolveConfirmedRecognition({
        tenantId: 'tenant-a',
        storeId: 'store-a',
        browserToken,
        client: client as never,
        now,
      }),
    ).resolves.toBeNull();
  });

  it('consome sessão e referências apenas uma vez', async () => {
    const client = fakeClient(null);
    client.checkoutRecognitionSession.updateMany.mockResolvedValue({ count: 1 });
    client.checkoutRecognitionAddressReference.updateMany.mockResolvedValue({ count: 2 });

    await expect(consumeRecognitionSession(client as never, 'session-a', now)).resolves.toBe(true);
    expect(client.checkoutRecognitionSession.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'session-a',
        expiresAt: { gt: now },
        invalidatedAt: null,
        consumedAt: null,
      },
      data: { consumedAt: now },
    });

    client.checkoutRecognitionSession.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(consumeRecognitionSession(client as never, 'session-a', now)).resolves.toBe(false);
  });
});

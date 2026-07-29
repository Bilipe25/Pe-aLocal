import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getDb: vi.fn() }));

vi.mock('@/server/database/client', () => ({ getDb: mocks.getDb }));

import {
  RecognitionRateLimitError,
  startCustomerRecognition,
} from '@/server/services/customer-recognition.service';

const now = new Date('2026-07-29T15:00:00.000Z');
const browserToken = 't'.repeat(43);

function savedAddress(index: number, overrides: Record<string, unknown> = {}) {
  return {
    id: `address-${index}`,
    tenantId: 'tenant-a',
    customerId: 'customer-a',
    label: index === 0 ? 'HOME' : 'OTHER',
    street: `Rua das Flores ${index}`,
    number: String(180 + index),
    complement: 'Apto 43',
    neighborhood: `Centro ${index}`,
    city: 'São Paulo',
    state: 'SP',
    zipCode: '01234567',
    reference: 'Portão azul',
    isDefault: index === 0,
    lastUsedAt: now,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: now,
    addressFingerprint: String(index).padStart(64, 'a').slice(-64),
    storeUses: [{ deliveryZoneId: 'zone-a' }],
    ...overrides,
  };
}

function activeSession(attemptCount: number, consecutiveFailures: number) {
  return {
    id: 'session-a',
    tenantId: 'tenant-a',
    storeId: 'store-a',
    customerId: null,
    attemptCount,
    consecutiveFailures,
    nextAttemptAt: null,
    blockedUntil: null,
    expiresAt: new Date('2026-07-29T15:15:00.000Z'),
    invalidatedAt: null,
    consumedAt: null,
  };
}

function database(
  customer: {
    id: string;
    name: string;
    phoneNormalized: string;
    recognitionEnabled: boolean;
  } | null,
  addresses: Array<Record<string, unknown>> = [],
  session: ReturnType<typeof activeSession> | null = null,
) {
  const client = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    checkoutRecognitionSession: {
      findUnique: vi.fn().mockResolvedValue(session),
      create: vi.fn().mockImplementation(({ data }) =>
        Promise.resolve({
          id: 'session-a',
          tenantId: data.tenantId,
          storeId: data.storeId,
          customerId: null,
          attemptCount: 0,
          consecutiveFailures: 0,
          nextAttemptAt: null,
          blockedUntil: null,
          expiresAt: data.expiresAt,
          invalidatedAt: null,
          consumedAt: null,
        }),
      ),
      update: vi.fn().mockResolvedValue({}),
    },
    checkoutRecognitionAddressReference: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      createMany: vi.fn().mockResolvedValue({ count: addresses.length }),
    },
    customerRecognitionThrottle: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({}),
    },
    customer: {
      findUnique: vi.fn().mockResolvedValue(customer),
    },
    customerAddress: {
      findMany: vi.fn().mockResolvedValue(addresses),
    },
    storeAddress: {
      findUnique: vi.fn().mockResolvedValue({ city: 'São Paulo', state: 'SP' }),
    },
    deliveryZonePostalRange: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
  return {
    client,
    db: {
      $transaction: vi.fn().mockImplementation((operation) => operation(client)),
    },
  };
}

describe('startCustomerRecognition', () => {
  beforeEach(() => vi.clearAllMocks());

  it('não inclui entrada, IP ou telefone bruto nos registros de sessão e throttle', async () => {
    const { client, db } = database(null);
    mocks.getDb.mockReturnValue(db);

    const response = await startCustomerRecognition({
      tenantId: 'tenant-a',
      storeId: 'store-a',
      input: { customerPhone: '5511999991234', customerName: 'João Martins' },
      browserToken: null,
      clientIp: '203.0.113.20',
      now,
    });

    expect(response.result).toEqual({
      recognized: false,
      message:
        'Não foi possível recuperar dados salvos. Você pode continuar preenchendo o checkout normalmente.',
    });
    const sessionData = client.checkoutRecognitionSession.create.mock.calls[0]?.[0].data;
    expect(sessionData).toMatchObject({ tenantId: 'tenant-a', storeId: 'store-a' });
    expect(sessionData).not.toHaveProperty('input');
    expect(sessionData).not.toHaveProperty('clientIp');
    expect(sessionData).not.toHaveProperty('browserToken');

    const serializedThrottleWrites = JSON.stringify(
      client.customerRecognitionThrottle.upsert.mock.calls,
    );
    expect(serializedThrottleWrites).not.toContain('203.0.113.20');
    expect(serializedThrottleWrites).not.toContain('5511999991234');
    expect(serializedThrottleWrites).toContain('keyHash');

    const throttleCreates = client.customerRecognitionThrottle.upsert.mock.calls.map(
      ([input]) => input.create,
    );
    expect(throttleCreates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tenantId: 'tenant-a', storeId: null, scope: 'IP' }),
        expect.objectContaining({ tenantId: 'tenant-a', storeId: null, scope: 'PHONE' }),
        expect.objectContaining({ tenantId: 'tenant-a', storeId: 'store-a', scope: 'STORE' }),
      ]),
    );
    for (const [input] of client.customerRecognitionThrottle.upsert.mock.calls) {
      expect(input.where).toHaveProperty('tenantId_scope_keyHash');
      expect(input.where).not.toHaveProperty('tenantId_storeId_scope_keyHash');
    }
  });

  it('torna telefone inexistente e nome incompatível indistinguíveis', async () => {
    const missing = database(null);
    mocks.getDb.mockReturnValueOnce(missing.db);
    const first = await startCustomerRecognition({
      tenantId: 'tenant-a',
      storeId: 'store-a',
      input: { customerPhone: '5511999991234', customerName: 'João Martins' },
      clientIp: '203.0.113.20',
      now,
    });

    const mismatch = database({
      id: 'customer-a',
      name: 'Outra Pessoa',
      phoneNormalized: '5511999991234',
      recognitionEnabled: true,
    });
    mocks.getDb.mockReturnValueOnce(mismatch.db);
    const second = await startCustomerRecognition({
      tenantId: 'tenant-a',
      storeId: 'store-a',
      input: { customerPhone: '5511999991234', customerName: 'João Martins' },
      clientIp: '203.0.113.20',
      now,
    });

    expect(second.result).toEqual(first.result);
  });

  it('consulta pelo tenant e telefone e nunca devolve o endereço completo', async () => {
    const recognized = database(
      {
        id: 'customer-a',
        name: 'João Martins',
        phoneNormalized: '5511999991234',
        recognitionEnabled: true,
      },
      [
        savedAddress(99, { city: 'Rio de Janeiro', neighborhood: 'Fora da cidade' }),
        ...Array.from({ length: 7 }, (_, index) => savedAddress(index)),
      ],
    );
    mocks.getDb.mockReturnValue(recognized.db);

    const response = await startCustomerRecognition({
      tenantId: 'tenant-a',
      storeId: 'store-a',
      input: { customerPhone: '5511999991234', customerName: ' JOÃO   MARTINS ' },
      clientIp: '203.0.113.20',
      now,
    });

    expect(recognized.client.customer.findUnique).toHaveBeenCalledWith({
      where: {
        tenantId_phoneNormalized: {
          tenantId: 'tenant-a',
          phoneNormalized: '5511999991234',
        },
      },
      select: { id: true, name: true, phoneNormalized: true, recognitionEnabled: true },
    });
    expect(recognized.client.customerAddress.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [
          { isDefault: 'desc' },
          { lastUsedAt: 'desc' },
          { createdAt: 'asc' },
          { id: 'asc' },
        ],
      }),
    );
    expect(response.result).toMatchObject({
      recognized: true,
      maskedName: 'João M***',
      maskedPhone: '(11) *****-**34',
    });
    expect(response.result.recognized).toBe(true);
    if (!response.result.recognized) throw new Error('Cliente deveria ter sido reconhecido.');
    expect(response.result.maskedAddresses[0]).toMatchObject({
      label: 'Casa',
      maskedAddress: 'Rua das F*** 0***, nº *** — Centro 0',
      isDefault: true,
      requiresDeliveryZoneSelection: false,
    });
    const serialized = JSON.stringify(response.result);
    expect(serialized).not.toMatch(/180|Apto 43|01234567|Portão azul|customer-a|address-0/);
    expect(response.result.maskedAddresses).toHaveLength(5);
    expect(serialized).not.toContain('Fora da cidade');
    expect(new TextEncoder().encode(serialized).byteLength).toBeLessThanOrEqual(4_096);
    const createManyData =
      recognized.client.checkoutRecognitionAddressReference.createMany.mock.calls[0]?.[0].data;
    expect(createManyData).toHaveLength(5);
  });

  it.each([
    { attempts: 2, failures: 2, delayMs: 15_000, blocked: false },
    { attempts: 3, failures: 3, delayMs: 60_000, blocked: false },
    { attempts: 4, failures: 4, delayMs: null, blocked: true },
  ])(
    'aplica cooldown progressivo depois da tentativa $attempts',
    async ({ attempts, failures, delayMs, blocked }) => {
      const session = activeSession(attempts, failures);
      const attempt = database(null, [], session);
      mocks.getDb.mockReturnValue(attempt.db);

      await startCustomerRecognition({
        tenantId: 'tenant-a',
        storeId: 'store-a',
        input: { customerPhone: '5511999991234', customerName: 'João Martins' },
        browserToken,
        clientIp: '203.0.113.20',
        now,
      });

      const data = attempt.client.checkoutRecognitionSession.update.mock.calls[0]?.[0].data;
      expect(data.consecutiveFailures).toBe(failures + 1);
      expect(data.nextAttemptAt).toEqual(
        delayMs === null ? null : new Date(now.getTime() + delayMs),
      );
      expect(data.blockedUntil).toEqual(blocked ? session.expiresAt : null);
    },
  );

  it('bloqueia a sexta consulta da mesma sessão antes da busca do Customer', async () => {
    const attempt = database(null, [], activeSession(5, 5));
    mocks.getDb.mockReturnValue(attempt.db);

    await expect(
      startCustomerRecognition({
        tenantId: 'tenant-a',
        storeId: 'store-a',
        input: { customerPhone: '5511999991234', customerName: 'João Martins' },
        browserToken,
        clientIp: '203.0.113.20',
        now,
      }),
    ).rejects.toBeInstanceOf(RecognitionRateLimitError);
    expect(attempt.client.customer.findUnique).not.toHaveBeenCalled();
  });
});

import { describe, expect, it } from 'vitest';

import {
  evaluateEffectiveStoreAvailability,
  type StoreAvailabilityInput,
} from '@/features/stores/availability';

function availabilityInput(
  overrides: Partial<StoreAvailabilityInput> = {},
): StoreAvailabilityInput {
  return {
    tenantStatus: 'ACTIVE',
    storeStatus: 'OPEN',
    isActive: true,
    isReady: true,
    timeZone: 'America/Fortaleza',
    openingHours: [{ dayOfWeek: 'MONDAY', openTime: '18:00', closeTime: '23:00' }],
    scheduleExceptions: [],
    ...overrides,
  };
}

describe('disponibilidade efetiva da loja', () => {
  it('abre dentro do intervalo local da loja e informa o próximo fechamento', () => {
    const result = evaluateEffectiveStoreAvailability(
      availabilityInput(),
      new Date('2026-07-20T22:00:00.000Z'), // segunda, 19h em Fortaleza
    );

    expect(result).toMatchObject({ acceptingOrders: true, state: 'OPEN' });
    expect(result.nextTransitionAt?.toISOString()).toBe('2026-07-21T02:00:00.000Z');
  });

  it('considera o trecho após meia-noite do intervalo do dia anterior', () => {
    const result = evaluateEffectiveStoreAvailability(
      availabilityInput({
        openingHours: [{ dayOfWeek: 'MONDAY', openTime: '18:00', closeTime: '02:00' }],
      }),
      new Date('2026-07-21T04:00:00.000Z'), // terça, 01h em Fortaleza
    );

    expect(result).toMatchObject({ acceptingOrders: true, state: 'OPEN' });
    expect(result.nextTransitionAt?.toISOString()).toBe('2026-07-21T05:00:00.000Z');
  });

  it('faz uma exceção CLOSED prevalecer sobre o horário semanal', () => {
    const result = evaluateEffectiveStoreAvailability(
      availabilityInput({
        scheduleExceptions: [
          {
            date: '2026-07-20',
            type: 'CLOSED',
            openTime: null,
            closeTime: null,
          },
        ],
      }),
      new Date('2026-07-20T22:00:00.000Z'),
    );

    expect(result).toMatchObject({
      acceptingOrders: false,
      state: 'CLOSED_BY_SCHEDULE',
    });
  });

  it('fecha toda a data excepcional, inclusive o intervalo iniciado na véspera', () => {
    const result = evaluateEffectiveStoreAvailability(
      availabilityInput({
        openingHours: [{ dayOfWeek: 'MONDAY', openTime: '18:00', closeTime: '02:00' }],
        scheduleExceptions: [
          {
            date: '2026-07-21',
            type: 'CLOSED',
            openTime: null,
            closeTime: null,
          },
        ],
      }),
      new Date('2026-07-21T04:00:00.000Z'), // terça, 01h em Fortaleza
    );

    expect(result).toMatchObject({
      acceptingOrders: false,
      state: 'CLOSED_BY_SCHEDULE',
    });
  });

  it('usa horário especial inclusive quando atravessa a meia-noite', () => {
    const result = evaluateEffectiveStoreAvailability(
      availabilityInput({
        openingHours: [],
        scheduleExceptions: [
          {
            date: '2026-07-20',
            type: 'CUSTOM_HOURS',
            openTime: '20:00',
            closeTime: '01:00',
          },
        ],
      }),
      new Date('2026-07-21T03:30:00.000Z'), // terça, 00h30 em Fortaleza
    );

    expect(result).toMatchObject({ acceptingOrders: true, state: 'OPEN' });
  });

  it('prioriza suspensão, inatividade, pausa, fechamento manual e prontidão', () => {
    const now = new Date('2026-07-20T22:00:00.000Z');

    expect(
      evaluateEffectiveStoreAvailability(availabilityInput({ tenantStatus: 'SUSPENDED' }), now)
        .state,
    ).toBe('TENANT_SUSPENDED');
    expect(
      evaluateEffectiveStoreAvailability(availabilityInput({ isActive: false }), now).state,
    ).toBe('STORE_INACTIVE');
    expect(
      evaluateEffectiveStoreAvailability(availabilityInput({ storeStatus: 'PAUSED' }), now).state,
    ).toBe('PAUSED');
    expect(
      evaluateEffectiveStoreAvailability(availabilityInput({ storeStatus: 'CLOSED' }), now).state,
    ).toBe('MANUALLY_CLOSED');
    expect(
      evaluateEffectiveStoreAvailability(availabilityInput({ isReady: false }), now).state,
    ).toBe('NOT_READY');
  });

  it('não aceita fuso fora da lista aprovada', () => {
    const result = evaluateEffectiveStoreAvailability(
      availabilityInput({ timeZone: 'UTC' }),
      new Date('2026-07-20T22:00:00.000Z'),
    );

    expect(result).toMatchObject({ acceptingOrders: false, state: 'NOT_READY' });
  });
});

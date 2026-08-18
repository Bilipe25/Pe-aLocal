import { describe, expect, it } from 'vitest';

import {
  getDueOrderOperationalSlaAlertStage,
  getOrderOperationalSlaStage,
} from '@/domain/orders/operational-sla';

const actionableAt = new Date('2026-08-17T12:00:00.000Z');
const enabledAt = new Date('2026-08-17T11:59:00.000Z');

function stageAt(elapsed: string, status = 'PENDING') {
  return getOrderOperationalSlaStage(
    {
      status,
      statusChangedAt: actionableAt,
      config: { enabled: true, enabledAt },
    },
    new Date(`2026-08-17T12:${elapsed}.000Z`),
  );
}

describe('SLA operacional de aceite', () => {
  it.each([
    ['01:59', 'NORMAL'],
    ['02:00', 'WARNING'],
    ['03:59', 'WARNING'],
    ['04:00', 'CRITICAL'],
  ])('classifica %s como %s', (elapsed, expected) => {
    expect(stageAt(elapsed)).toBe(expected);
  });

  it('retorna NONE para estados não acionáveis', () => {
    expect(stageAt('04:00', 'AWAITING_PAYMENT')).toBe('NONE');
    expect(stageAt('04:00', 'CONFIRMED')).toBe('NONE');
  });

  it('ignora ciclos anteriores à ativação e escolhe somente CRITICAL no primeiro atraso tardio', () => {
    expect(
      getOrderOperationalSlaStage(
        {
          status: 'PENDING',
          statusChangedAt: actionableAt,
          config: { enabled: true, enabledAt: new Date('2026-08-17T12:01:00.000Z') },
        },
        new Date('2026-08-17T12:10:00.000Z'),
      ),
    ).toBe('NONE');
    expect(
      getDueOrderOperationalSlaAlertStage(
        {
          status: 'PENDING',
          statusChangedAt: actionableAt,
          config: { enabled: true, enabledAt },
        },
        new Date('2026-08-17T12:04:30.000Z'),
      ),
    ).toBe('CRITICAL');
  });
});

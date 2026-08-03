import { describe, expect, it } from 'vitest';

import {
  formatElapsedMinutes,
  formatOperationalDuration,
  formatPromisedFulfillment,
  formatSlaAlertLabel,
} from '@/domain/orders/order-time';

describe('formatação de tempo operacional', () => {
  it('troca totais extremos de minutos por dias e horas legíveis', () => {
    expect(formatOperationalDuration(4_270)).toBe('2 dias e 23 horas');
    expect(formatOperationalDuration(1_440)).toBe('1 dia');
    expect(formatOperationalDuration(1_500)).toBe('1 dia e 1 hora');
  });

  it('mantém minutos e horas compactos nos intervalos curtos', () => {
    expect(formatOperationalDuration(18)).toBe('18 min');
    expect(formatOperationalDuration(125)).toBe('2 h 5 min');
    expect(formatElapsedMinutes(0)).toBe('agora');
    expect(formatElapsedMinutes(18)).toBe('há 18 min');
  });

  it('comunica o desvio do SLA em vez do tempo bruto', () => {
    expect(formatSlaAlertLabel('Aceite', 4_270, 3)).toBe('Aceite em atraso há 2 dias e 23 horas');
    expect(formatSlaAlertLabel('Pix', 10, 10)).toBe('Pix atingiu o limite de 10 min');
  });

  it('identifica previsão vencida e mantém a janela quando ainda está no prazo', () => {
    expect(
      formatPromisedFulfillment(
        '2026-07-31T12:30:00.000Z',
        '2026-07-31T12:45:00.000Z',
        'UTC',
        new Date('2026-07-31T13:03:00.000Z').getTime(),
      ),
    ).toEqual({ label: 'Previsão vencida há 18 min', isOverdue: true });

    expect(
      formatPromisedFulfillment(
        '2026-07-31T12:30:00.000Z',
        '2026-07-31T12:45:00.000Z',
        'UTC',
        new Date('2026-07-31T12:17:00.000Z').getTime(),
      ),
    ).toEqual({ label: 'Previsão 12:30–12:45', isOverdue: false });
  });
});

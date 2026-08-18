import { describe, expect, it } from 'vitest';

import { resolveReportPeriod } from '@/domain/reports/report-period';
import { reportsPeriodInputSchema } from '@/features/reports/schemas';

describe('períodos dos relatórios avançados', () => {
  it('compara Hoje somente com o mesmo tempo decorrido de ontem na timezone da loja', () => {
    const period = resolveReportPeriod(
      { preset: 'TODAY' },
      'America/Fortaleza',
      new Date('2026-08-18T15:34:00.000Z'),
    );

    expect(period.startLocalDate).toBe('2026-08-18');
    expect(period.current.start.toISOString()).toBe('2026-08-18T03:00:00.000Z');
    expect(period.current.end.toISOString()).toBe('2026-08-18T15:34:00.000Z');
    expect(period.previous.start.toISOString()).toBe('2026-08-17T03:00:00.000Z');
    expect(period.previous.end.toISOString()).toBe('2026-08-17T15:34:00.000Z');
    expect(period.comparisonLabel).toBe('Mesmo horário de ontem');
    expect(period.granularity).toBe('HOUR');
  });

  it('resolve os últimos sete dias e uma janela anterior com a mesma duração', () => {
    const period = resolveReportPeriod(
      { preset: 'LAST_7_DAYS' },
      'America/Fortaleza',
      new Date('2026-08-18T15:34:00.000Z'),
    );

    expect(period.startLocalDate).toBe('2026-08-12');
    expect(period.endLocalDate).toBe('2026-08-18');
    expect(period.current.end.toISOString()).toBe('2026-08-18T15:34:00.000Z');
    expect(period.previous.start.toISOString()).toBe('2026-08-05T14:26:00.000Z');
    expect(period.previous.end.toISOString()).toBe('2026-08-12T03:00:00.000Z');
    expect(period.comparisonLabel).toBe('Mesmo intervalo imediatamente anterior');
    expect(period.durationDays).toBe(7);
    expect(period.granularity).toBe('DAY');
  });

  it('resume trinta dias em semanas sem alterar a duração comparada', () => {
    const period = resolveReportPeriod(
      { preset: 'LAST_30_DAYS' },
      'America/Fortaleza',
      new Date('2026-08-18T15:34:00.000Z'),
    );

    expect(period.durationDays).toBe(30);
    expect(period.granularity).toBe('WEEK');
    expect(period.previous.end.toISOString()).toBe(period.current.start.toISOString());
    expect(period.previous.end.getTime() - period.previous.start.getTime()).toBe(
      period.current.end.getTime() - period.current.start.getTime(),
    );
  });

  it('aceita no máximo 365 dias personalizados e rejeita datas invertidas', () => {
    expect(
      reportsPeriodInputSchema.safeParse({
        preset: 'CUSTOM',
        startLocalDate: '2025-08-19',
        endLocalDate: '2026-08-18',
      }).success,
    ).toBe(true);
    expect(
      reportsPeriodInputSchema.safeParse({
        preset: 'CUSTOM',
        startLocalDate: '2025-08-18',
        endLocalDate: '2026-08-18',
      }).success,
    ).toBe(false);
    expect(
      reportsPeriodInputSchema.safeParse({
        preset: 'CUSTOM',
        startLocalDate: '2026-08-19',
        endLocalDate: '2026-08-18',
      }).success,
    ).toBe(false);
  });
});

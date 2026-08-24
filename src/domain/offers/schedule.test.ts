import { describe, expect, it } from 'vitest';

import {
  isOfferScheduleActive,
  isOfferScheduleActiveAtLocal,
  offerSchedulesOverlap,
} from '@/domain/offers/schedule';

describe('offer schedule', () => {
  it('uses an inclusive start and exclusive end in the store time zone', () => {
    const schedule = { startMinute: 10 * 60, endMinuteExclusive: 11 * 60 };
    expect(
      isOfferScheduleActive(schedule, 'America/Fortaleza', new Date('2026-08-20T13:00:00Z')),
    ).toBe(true);
    expect(
      isOfferScheduleActive(schedule, 'America/Fortaleza', new Date('2026-08-20T14:00:00Z')),
    ).toBe(false);
  });

  it('keeps wall-clock semantics through the spring DST transition', () => {
    const schedule = {
      weekdays: ['SUNDAY'] as const,
      startMinute: 90,
      endMinuteExclusive: 210,
    };
    expect(
      isOfferScheduleActive(schedule, 'America/New_York', new Date('2026-03-08T06:45:00Z')),
    ).toBe(true);
    expect(
      isOfferScheduleActive(schedule, 'America/New_York', new Date('2026-03-08T07:15:00Z')),
    ).toBe(true);
    expect(
      isOfferScheduleActive(schedule, 'America/New_York', new Date('2026-03-08T07:30:00Z')),
    ).toBe(false);
  });

  it('treats both repeated fall DST wall-clock hours as active', () => {
    const schedule = {
      weekdays: ['SUNDAY'] as const,
      startMinute: 60,
      endMinuteExclusive: 120,
    };
    expect(
      isOfferScheduleActive(schedule, 'America/New_York', new Date('2026-11-01T05:30:00Z')),
    ).toBe(true);
    expect(
      isOfferScheduleActive(schedule, 'America/New_York', new Date('2026-11-01T06:30:00Z')),
    ).toBe(true);
  });

  it('attaches an overnight window to its starting weekday and date', () => {
    const schedule = {
      startsOn: '2026-08-17',
      endsOnExclusive: '2026-08-18',
      weekdays: ['MONDAY'] as const,
      startMinute: 22 * 60,
      endMinuteExclusive: 2 * 60,
    };
    expect(isOfferScheduleActiveAtLocal(schedule, '2026-08-17', 23 * 60)).toBe(true);
    expect(isOfferScheduleActiveAtLocal(schedule, '2026-08-18', 60)).toBe(true);
    expect(isOfferScheduleActiveAtLocal(schedule, '2026-08-18', 2 * 60)).toBe(false);
  });

  it('accepts database dates after the Next cache serializes them', () => {
    const cachedSchedule = JSON.parse(
      JSON.stringify({
        startsOn: new Date('2026-08-21T00:00:00.000Z'),
        endsOnExclusive: new Date('2026-08-31T00:00:00.000Z'),
        weekdays: [],
        startMinute: null,
        endMinuteExclusive: null,
      }),
    );

    expect(isOfferScheduleActiveAtLocal(cachedSchedule, '2026-08-24', 12 * 60)).toBe(true);
    expect(isOfferScheduleActiveAtLocal(cachedSchedule, '2026-08-31', 0)).toBe(false);
  });

  it('detects overlap without confusing adjacent exclusive windows', () => {
    expect(
      offerSchedulesOverlap(
        { weekdays: ['MONDAY'], startMinute: 10 * 60, endMinuteExclusive: 11 * 60 },
        { weekdays: ['MONDAY'], startMinute: 11 * 60, endMinuteExclusive: 12 * 60 },
      ),
    ).toBe(false);
    expect(
      offerSchedulesOverlap(
        { weekdays: ['MONDAY'], startMinute: 22 * 60, endMinuteExclusive: 2 * 60 },
        { weekdays: ['TUESDAY'], startMinute: 60, endMinuteExclusive: 3 * 60 },
      ),
    ).toBe(true);
  });
});

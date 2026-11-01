import { describe, expect, it } from 'vitest';
import { dayKey, dayKeyDate, groupByDay, shiftDayKey, type ReplayDay } from '@/features/replays/ui/listDays';

const at = (iso: string) => Date.parse(iso) / 1000;

describe('replay list days', () => {
	it('keys a game by the calendar day in the given zone', () => {
		const lateEvening = at('2026-10-31T22:30:00Z');
		expect(dayKey(lateEvening, 'UTC')).toBe('2026-10-31');
		expect(dayKey(lateEvening, 'Europe/Moscow')).toBe('2026-11-01');
		expect(dayKey(lateEvening, 'America/New_York')).toBe('2026-10-31');
		// New York leaves daylight saving time at 06:00 UTC that morning: 01:30 comes twice.
		expect(dayKey(at('2026-11-01T05:30:00Z'), 'America/New_York')).toBe('2026-11-01');
		expect(dayKey(at('2026-11-01T06:30:00Z'), 'America/New_York')).toBe('2026-11-01');
		expect(dayKey(at('2026-11-02T04:30:00Z'), 'America/New_York')).toBe('2026-11-01');
	});

	it('shifts a day across month, year and leap day ends', () => {
		expect(shiftDayKey('2026-11-01', -1)).toBe('2026-10-31');
		expect(shiftDayKey('2026-01-01', -1)).toBe('2025-12-31');
		expect(shiftDayKey('2024-02-28', 1)).toBe('2024-02-29');
		expect(shiftDayKey('2026-03-01', -1)).toBe('2026-02-28');
		expect(dayKeyDate('2026-10-31').toISOString()).toBe('2026-10-31T00:00:00.000Z');
	});

	it('groups runs of games on one day and keeps games without a start time apart', () => {
		const games = [
			{ id: 1, startedAt: at('2026-11-01T19:00:00Z') },
			{ id: 2, startedAt: at('2026-11-01T17:00:00Z') },
			{ id: 3, startedAt: at('2026-10-31T21:30:00Z') },
			{ id: 4, startedAt: at('2026-10-31T19:00:00Z') },
			{ id: 5, startedAt: null },
		];
		const ids = (days: ReplayDay<(typeof games)[number]>[]) => days.map((day) => [day.key, day.replays.map((game) => game.id)]);

		expect(ids(groupByDay(games, 'UTC'))).toEqual([
			['2026-11-01', [1, 2]],
			['2026-10-31', [3, 4]],
			[null, [5]],
		]);
		// 21:30 UTC is already the next day in Moscow.
		expect(ids(groupByDay(games, 'Europe/Moscow'))).toEqual([
			['2026-11-01', [1, 2, 3]],
			['2026-10-31', [4]],
			[null, [5]],
		]);
		expect(groupByDay([], 'UTC')).toEqual([]);
	});
});

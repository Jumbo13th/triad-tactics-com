import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	formatLocalizedDate,
	formatLocalizedDateTime,
	formatTimeZoneDisplay,
	getViewerDateTimePreferences,
	parseDateTimeValue
} from '@/platform/dateTime';

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe('platform/dateTime', () => {
	it('parses sqlite-style timestamps as UTC', () => {
		const result = parseDateTimeValue('2026-03-15 14:45:00');

		expect(result?.toISOString()).toBe('2026-03-15T14:45:00.000Z');
	});

	it('parses sqlite-style timestamps with surrounding whitespace', () => {
		const result = parseDateTimeValue('  2026-03-15 14:45:00  ');

		expect(result?.toISOString()).toBe('2026-03-15T14:45:00.000Z');
	});

	it('preserves explicit offsets when parsing timestamps', () => {
		const result = parseDateTimeValue('2026-03-15T14:45:00+02:00');

		expect(result?.toISOString()).toBe('2026-03-15T12:45:00.000Z');
	});

	it('parses date-only values as midnight UTC', () => {
		const result = parseDateTimeValue('2026-01-24');

		expect(result?.toISOString()).toBe('2026-01-24T00:00:00.000Z');
	});

	it('returns null for invalid date values', () => {
		expect(parseDateTimeValue('not-a-date')).toBeNull();
	});

	it('formats localized date/time with viewer timezone and 24-hour cycle', () => {
		const value = '2026-03-15 14:45:00';
		const expected = new Intl.DateTimeFormat('en-US', {
			dateStyle: 'full',
			timeStyle: 'short',
			timeZone: 'Europe/Berlin',
			hourCycle: 'h23'
		}).format(new Date('2026-03-15T14:45:00Z'));

		expect(
			formatLocalizedDateTime(value, {
				locale: 'en-US',
				timeZone: 'Europe/Berlin',
				hourCycle: 'h23',
				dateStyle: 'full',
				timeStyle: 'short'
			})
		).toBe(expected);
	});

	it('uses the requested hour cycle for 12h and 24h viewers', () => {
		const value = '2026-03-15T14:45:00Z';
		const expected12h = new Intl.DateTimeFormat('en-US', {
			dateStyle: 'medium',
			timeStyle: 'short',
			timeZone: 'UTC',
			hourCycle: 'h12'
		}).format(new Date('2026-03-15T14:45:00Z'));
		const expected24h = new Intl.DateTimeFormat('en-US', {
			dateStyle: 'medium',
			timeStyle: 'short',
			timeZone: 'UTC',
			hourCycle: 'h23'
		}).format(new Date('2026-03-15T14:45:00Z'));

		const actual12h = formatLocalizedDateTime(value, {
			locale: 'en-US',
			timeZone: 'UTC',
			hourCycle: 'h12'
		});
		const actual24h = formatLocalizedDateTime(value, {
			locale: 'en-US',
			timeZone: 'UTC',
			hourCycle: 'h23'
		});

		expect(actual12h).toBe(expected12h);
		expect(actual24h).toBe(expected24h);
		expect(actual12h).not.toBe(actual24h);
	});

	it('returns null when date/time cannot be formatted', () => {
		expect(formatLocalizedDateTime(null, { locale: 'en-US', timeZone: 'UTC' })).toBeNull();
		expect(formatLocalizedDateTime('2026-03-15 14:45:00', { locale: 'en-US', timeZone: null })).toBeNull();
		expect(formatLocalizedDateTime('invalid', { locale: 'en-US', timeZone: 'UTC' })).toBeNull();
	});

	it('returns null when date/time formatting receives an invalid time zone', () => {
		expect(formatLocalizedDateTime('2026-03-15 14:45:00', { locale: 'en-US', timeZone: 'Mars/Base' })).toBeNull();
	});

	it('returns null when date/time formatting throws during formatter construction', () => {
		const dateTimeFormatSpy = vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(
			(() => {
				throw new RangeError('invalid locale');
			}) as unknown as typeof Intl.DateTimeFormat
		);

		expect(formatLocalizedDateTime('2026-03-15 14:45:00', { locale: 'en-US', timeZone: 'UTC' })).toBeNull();

		dateTimeFormatSpy.mockRestore();
	});

	it('formats localized date-only values', () => {
		const expected = new Intl.DateTimeFormat('en-GB', {
			dateStyle: 'long',
			timeZone: 'UTC'
		}).format(new Date('2026-01-24T00:00:00Z'));

		expect(formatLocalizedDate('2026-01-24', { locale: 'en-GB' })).toBe(expected);
	});

	it('returns null when date-only formatting receives invalid input', () => {
		expect(formatLocalizedDate(null, { locale: 'en-GB' })).toBeNull();
		expect(formatLocalizedDate('invalid', { locale: 'en-GB' })).toBeNull();
	});

	it('returns null when date-only formatting receives an invalid time zone', () => {
		expect(formatLocalizedDate('2026-01-24', { locale: 'en-GB', timeZone: 'Mars/Base' })).toBeNull();
	});

	it('returns null when date-only formatting throws during formatter construction', () => {
		const dateTimeFormatSpy = vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(
			(() => {
				throw new RangeError('invalid locale');
			}) as unknown as typeof Intl.DateTimeFormat
		);

		expect(formatLocalizedDate('2026-01-24', { locale: 'en-GB' })).toBeNull();

		dateTimeFormatSpy.mockRestore();
	});

	it('formats time zone labels for UI display', () => {
		expect(formatTimeZoneDisplay('Europe/Berlin')).toBe('Europe / Berlin');
		expect(formatTimeZoneDisplay(null)).toBeNull();
	});

	it('returns null viewer preferences on the server', () => {
		expect(getViewerDateTimePreferences()).toEqual({
			timeZone: null,
			hourCycle: null
		});
	});

	it('reads viewer preferences from Intl in the browser', () => {
		vi.stubGlobal('window', {});
		const dateTimeFormatSpy = vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(
			(() => ({
				resolvedOptions: () => ({ timeZone: '', hourCycle: 'h23' })
			})) as unknown as typeof Intl.DateTimeFormat
		);

		expect(getViewerDateTimePreferences()).toEqual({
			timeZone: 'UTC',
			hourCycle: 'h23'
		});

		dateTimeFormatSpy.mockRestore();
	});
});

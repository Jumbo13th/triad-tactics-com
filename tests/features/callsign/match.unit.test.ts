import { describe, expect, it } from 'vitest';
import {
	findCallsignConflicts,
	normalizeCallsignForExactMatch,
	soundKey,
	transliterateToLatin
} from '@/features/callsign/match';

describe('callsign/match', () => {
	it('normalizes for exact match (case/spacing/punctuation)', () => {
		expect(normalizeCallsignForExactMatch(' Test_User ')).toBe('testuser');
		expect(normalizeCallsignForExactMatch('test user')).toBe('testuser');
		expect(normalizeCallsignForExactMatch("O’Connor")).toBe('oconnor');
	});

	it('produces the same sound key for visually similar callsigns', () => {
		expect(soundKey('Ghost')).toBe(soundKey('G0st'));
	});

	it('transliterates basic Cyrillic to Latin', () => {
		expect(transliterateToLatin('Николай')).toBe('nikolay');
	});

	it('finds exact and sound-alike conflicts (without double-reporting)', () => {
		const conflicts = findCallsignConflicts('Ghost', ['Ghost', 'G0st', 'Other']);
		expect(conflicts.normalized).toBe('ghost');
		expect(conflicts.exactMatches).toEqual(['Ghost']);
		expect(conflicts.soundMatches).toEqual(['G0st']);
	});
});

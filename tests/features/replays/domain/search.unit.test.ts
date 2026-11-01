import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { forEachInflatedLine } from '@/features/replays/domain/encoding';
import { createPlayerIndex } from '@/features/replays/domain/players';
import { replayListQuerySchema } from '@/features/replays/domain/requests';
import {
	REPLAY_SEARCH_MAX_LENGTH,
	applicableFilters,
	hasListFilters,
	isReplayDay,
	parseReplaySearch,
	sortFacets,
	toGameFilter,
	type ReplayFacets,
	type ReplayListFilters,
} from '@/features/replays/domain/search';

describe('parseReplaySearch', () => {
	it('splits the query into lowercased words, each kept once', () => {
		expect(parseReplaySearch('  Тонкая   НИТЬ тонкая ')).toEqual({
			terms: [
				{ kind: 'text', text: 'тонкая' },
				{ kind: 'text', text: 'нить' },
			],
		});
		expect(parseReplaySearch('')).toEqual({ terms: [] });
	});

	it('reads a number as an episode or title words, and E2 or Ep2 as an episode only', () => {
		expect(parseReplaySearch('2 E3 ep.4 Ep12 e123 1984').terms).toEqual([
			{ kind: 'number', text: '2', episode: 2 },
			{ kind: 'episode', episode: 3 },
			{ kind: 'episode', episode: 4 },
			{ kind: 'episode', episode: 12 },
			{ kind: 'text', text: 'e123' },
			{ kind: 'text', text: '1984' },
		]);
	});

	it('bounds the words it searches by', () => {
		expect(parseReplaySearch('a b c d e f g h i j').terms).toHaveLength(8);
		const long = parseReplaySearch('x'.repeat(REPLAY_SEARCH_MAX_LENGTH + 50));
		expect(long.terms).toEqual([{ kind: 'text', text: 'x'.repeat(REPLAY_SEARCH_MAX_LENGTH) }]);
	});
});

describe('replayListQuerySchema', () => {
	const plain = { q: '', terrain: '', mission: '', from: '', to: '', sort: 'newest', page: 1 };

	it('falls back to the plain first page for values that make no sense', () => {
		expect(replayListQuerySchema.parse({})).toEqual(plain);
		expect(replayListQuerySchema.parse({ q: '  eden  ', page: '3' })).toEqual({ ...plain, q: 'eden', page: 3 });
		expect(replayListQuerySchema.parse({ q: ['first', 'second'], page: ['2', '5'] })).toEqual({ ...plain, q: 'first', page: 2 });
		for (const page of ['0', '-1', '2.5', 'abc', '']) expect(replayListQuerySchema.parse({ page }).page).toBe(1);
		expect(replayListQuerySchema.parse({ q: 'y'.repeat(300) }).q).toHaveLength(REPLAY_SEARCH_MAX_LENGTH);
	});

	it('reads every filter, trimmed and bounded, taking the first of repeated values', () => {
		expect(
			replayListQuerySchema.parse({
				q: ' двойка ',
				terrain: ' Belleau Wood ',
				mission: [' GAW ', 'other'],
				from: '2026-10-01',
				to: ' 2026-10-31 ',
				sort: 'players',
				page: '2',
			})
		).toEqual({ q: 'двойка', terrain: 'Belleau Wood', mission: 'GAW', from: '2026-10-01', to: '2026-10-31', sort: 'players', page: 2 });
		expect(replayListQuerySchema.parse({ terrain: 't'.repeat(300) }).terrain).toHaveLength(100);
		expect(replayListQuerySchema.parse({ mission: 'm'.repeat(300) }).mission).toHaveLength(64);
		expect(replayListQuerySchema.parse({ sort: 'oldest' }).sort).toBe('oldest');
	});

	it('drops dates that are not calendar days and sorts it does not know', () => {
		for (const from of ['2026-02-30', '2026-13-01', '2026-1-5', '01.10.2026', '2026-10-01T00:00', '0050-01-01', 'today', '']) {
			expect(replayListQuerySchema.parse({ from, to: from }), from).toMatchObject({ from: '', to: '' });
		}
		expect(replayListQuerySchema.parse({ from: '2024-02-29' }).from).toBe('2024-02-29');
		for (const sort of ['NEWEST', 'random', '', 'players ']) expect(replayListQuerySchema.parse({ sort }).sort, sort).toBe('newest');
		expect(replayListQuerySchema.parse({ terrain: 42, mission: { a: 1 } })).toMatchObject({ terrain: '', mission: '' });
	});
});

describe('isReplayDay', () => {
	it('accepts real calendar days only', () => {
		expect(isReplayDay('2026-11-01')).toBe(true);
		expect(isReplayDay('2024-02-29')).toBe(true);
		expect(isReplayDay('2026-02-29')).toBe(false);
		expect(isReplayDay('2026-04-31')).toBe(false);
		expect(isReplayDay('2026-00-10')).toBe(false);
		expect(isReplayDay(' 2026-11-01')).toBe(false);
	});
});

describe('the list filters', () => {
	const plain: ReplayListFilters = { query: '', terrain: '', mission: '', from: '', to: '', sort: 'newest' };
	const facets: ReplayFacets = {
		terrains: ['Arland', 'Eden'],
		missions: [
			{ shortCode: 'GAW', title: 'Great African War' },
			{ shortCode: 'thread', title: 'Тонкая нить' },
		],
	};

	it('name a terrain and mission as the facets spell them, and drop ones no published game has', () => {
		expect(applicableFilters({ ...plain, terrain: 'arland', mission: 'gaw' }, facets)).toEqual({ ...plain, terrain: 'Arland', mission: 'GAW' });
		expect(applicableFilters({ ...plain, terrain: 'Takistan', mission: 'unknown' }, facets)).toEqual(plain);
		expect(applicableFilters({ ...plain, terrain: 'Arland', mission: 'thread' }, { terrains: [], missions: [] })).toEqual(plain);
	});

	it('turn a backwards range around and keep a one-sided one', () => {
		expect(applicableFilters({ ...plain, from: '2026-10-31', to: '2026-10-01' }, facets)).toMatchObject({ from: '2026-10-01', to: '2026-10-31' });
		expect(applicableFilters({ ...plain, from: '2026-10-31' }, facets)).toMatchObject({ from: '2026-10-31', to: '' });
		expect(applicableFilters({ ...plain, to: '2026-10-01' }, facets)).toMatchObject({ from: '', to: '2026-10-01' });
	});

	it('cover whole UTC days, the last one included', () => {
		const filter = toGameFilter({ ...plain, query: 'E2 eden', terrain: 'Eden', mission: 'GAW', from: '2026-10-31', to: '2026-10-31' });
		expect(filter).toEqual({
			search: { terms: [{ kind: 'episode', episode: 2 }, { kind: 'text', text: 'eden' }] },
			terrain: 'Eden',
			missionShortCode: 'GAW',
			startedFrom: Date.parse('2026-10-31T00:00:00Z') / 1000,
			startedBefore: Date.parse('2026-11-01T00:00:00Z') / 1000,
		});
		expect(toGameFilter({ ...plain, to: '2026-12-31' }).startedBefore).toBe(Date.parse('2027-01-01T00:00:00Z') / 1000);
		expect(toGameFilter(plain)).toEqual({ search: { terms: [] }, terrain: null, missionShortCode: null, startedFrom: null, startedBefore: null });
	});

	it('offer terrains and missions in the reader\'s alphabet, repeated titles by short code', () => {
		const unsorted: ReplayFacets = {
			terrains: ['Kunar', 'arland', 'Eden'],
			missions: [
				{ shortCode: 'LLGAW', title: 'Great African War' },
				{ shortCode: 'thread', title: 'Тонкая нить' },
				{ shortCode: 'untitled', title: '' },
				{ shortCode: 'GAW', title: 'Great African War' },
				{ shortCode: 'yolki', title: 'Ёлки' },
				{ shortCode: 'ep10', title: 'Episode 10' },
				{ shortCode: 'ep9', title: 'Episode 9' },
			],
		};
		expect(sortFacets(unsorted, 'en')).toEqual({
			terrains: ['arland', 'Eden', 'Kunar'],
			missions: ['ep9', 'ep10', 'GAW', 'LLGAW', 'untitled', 'yolki', 'thread'].map((code) => unsorted.missions.find((m) => m.shortCode === code)),
		});
		expect(sortFacets(unsorted, 'ru').missions.map((m) => m.shortCode)).toEqual(['yolki', 'thread', 'ep9', 'ep10', 'GAW', 'LLGAW', 'untitled']);
		expect(unsorted.terrains).toEqual(['Kunar', 'arland', 'Eden']);
	});

	it('count the sort as no filter', () => {
		expect(hasListFilters(plain)).toBe(false);
		expect(hasListFilters({ ...plain, sort: 'players' })).toBe(false);
		expect(hasListFilters({ ...plain, to: '2026-10-01' })).toBe(true);
		expect(hasListFilters({ ...plain, query: 'eden' })).toBe(true);
	});
});

describe('createPlayerIndex', () => {
	it('joins identity GUIDs and displayed names by player reference', () => {
		const index = createPlayerIndex();
		for (const line of ['LLI 1', 'H session s', 'I 1 6F1A2B3C-4D5E-6F70-8192-A3B4C5D6E7F8', 'I 3 0b9c8d7e-6f5a-4b3c-2d1e-0f9a8b7c6d5e', 'I x broken']) {
			index.readIdentityLine(line);
		}
		for (const line of [
			'LLR 1',
			'H mission "N 9 \\"not a record\\""',
			'N 1 "[ABC]One"',
			'N 2 "Say \\"Hi\\""',
			'N 1 "[ABC]One"',
			'N 1 "[XYZ]One"',
			'N 4 "   "',
			'N - "No reference"',
			'NX 5 "Other record"',
			'N 6 "Unclosed',
		]) {
			index.readSegmentLine(line);
		}
		expect(index.players()).toEqual([
			{ ref: 1, identityGuid: '6f1a2b3c-4d5e-6f70-8192-a3b4c5d6e7f8', name: '[ABC]One' },
			{ ref: 1, identityGuid: '6f1a2b3c-4d5e-6f70-8192-a3b4c5d6e7f8', name: '[XYZ]One' },
			{ ref: 2, identityGuid: null, name: 'Say "Hi"' },
			{ ref: 3, identityGuid: '0b9c8d7e-6f5a-4b3c-2d1e-0f9a8b7c6d5e', name: '' },
		]);
	});
});

describe('forEachInflatedLine', () => {
	const stored = (text: string) => {
		const raw = Buffer.from(text, 'utf8');
		return { encoded: gzipSync(raw), size: raw.length, sha256: createHash('sha256').update(raw).digest('hex') };
	};

	it('visits whole lines and leaves out a last line cut off without its line feed', async () => {
		const file = stored('first\r\nвторая строка\n\nlast cut');
		const lines: string[] = [];
		expect(await forEachInflatedLine(file.encoded, file.size, file.sha256, (line) => lines.push(line))).toBe(true);
		expect(lines).toEqual(['first', 'вторая строка', '']);
	});

	it('refuses a file that is not the one it claims to be', async () => {
		const file = stored('N 1 "One"\n');
		expect(await forEachInflatedLine(file.encoded, file.size, '0'.repeat(64), () => {})).toBe(false);
		expect(await forEachInflatedLine(file.encoded, file.size - 1, file.sha256, () => {})).toBe(false);
		expect(await forEachInflatedLine(Buffer.from('not gzip'), file.size, file.sha256, () => {})).toBe(false);
	});
});

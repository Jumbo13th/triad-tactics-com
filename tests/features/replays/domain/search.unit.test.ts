import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { forEachInflatedLine } from '@/features/replays/domain/encoding';
import { createPlayerIndex } from '@/features/replays/domain/players';
import { replayListQuerySchema } from '@/features/replays/domain/requests';
import { REPLAY_SEARCH_MAX_LENGTH, parseReplaySearch } from '@/features/replays/domain/search';

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
	it('falls back to the plain first page for values that make no sense', () => {
		expect(replayListQuerySchema.parse({})).toEqual({ q: '', page: 1 });
		expect(replayListQuerySchema.parse({ q: '  eden  ', page: '3' })).toEqual({ q: 'eden', page: 3 });
		expect(replayListQuerySchema.parse({ q: ['first', 'second'], page: ['2', '5'] })).toEqual({ q: 'first', page: 2 });
		for (const page of ['0', '-1', '2.5', 'abc', '']) expect(replayListQuerySchema.parse({ page }).page).toBe(1);
		expect(replayListQuerySchema.parse({ q: 'y'.repeat(300) }).q).toHaveLength(REPLAY_SEARCH_MAX_LENGTH);
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

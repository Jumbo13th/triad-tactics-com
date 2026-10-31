import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { inflate } from '@/features/replays/domain/encoding';
import { EMPTY_BODY_SHA256, parsePieceIndex, signUploadRequest } from '@/features/replays/domain/protocol';
import { parseSegmentHeader } from '@/features/replays/domain/segmentHeader';

const sha256 = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');

describe('ll-upload/1 signing', () => {
	it('matches the protocol test vector', () => {
		const body = sha256('hello');
		expect(body).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
		expect(signUploadRequest('test-secret', 'PUT', `/files/${body}/pieces/0`, '1793563200', body)).toBe(
			'd2af137f20a18b26fe7ee727c7fa683ec1e570cf724f8bca9df6b975a211829a'
		);
	});

	it('names the empty body hash the protocol gives', () => {
		expect(sha256('')).toBe(EMPTY_BODY_SHA256);
	});
});

describe('piece index', () => {
	it('takes plain decimal indexes below the piece limit', () => {
		expect(parsePieceIndex('0')).toBe(0);
		expect(parsePieceIndex('99')).toBe(99);
		expect(parsePieceIndex('100')).toBeNull();
		expect(parsePieceIndex('01')).toBeNull();
		expect(parsePieceIndex('-1')).toBeNull();
		expect(parsePieceIndex('1e1')).toBeNull();
	});
});

describe('segment header', () => {
	it('reads the header lines of ll-replay/1', () => {
		const head = [
			'LLR 1',
			'H session 20261031-201500-eden',
			'H segment 2',
			'H mission "Operation \\"Example\\""',
			'H author "[ABC]Author"',
			'H world "{853E92315D1D9EFE}worlds/Eden/Eden.ent"',
			'H bounds 0 0 12800 12800',
			'H started 1793563200',
			'H resumed 12400',
			'H side US "United States" 2266b3',
			'H end',
			'H mission "after the header"',
		].join('\r\n');
		expect(parseSegmentHeader(head)).toEqual({
			mission: 'Operation "Example"',
			author: '[ABC]Author',
			world: '{853E92315D1D9EFE}worlds/Eden/Eden.ent',
			segment: 2,
			started: 1793563200,
			resumed: 12400,
		});
	});

	it('refuses content that is not a recording', () => {
		expect(parseSegmentHeader('{"schema":"ll-stats/1"}')).toBeNull();
	});
});

describe('inflate', () => {
	const content = Buffer.from('LLR 1\nH end\n' + 'P 17 4512 6120 41 87\n'.repeat(500));

	it('gives the size, identity and head of the content', async () => {
		const inflated = await inflate(gzipSync(content), content.length);
		expect(inflated?.size).toBe(content.length);
		expect(inflated?.sha256).toBe(sha256(content));
		expect(inflated?.head.startsWith('LLR 1\nH end\n')).toBe(true);
	});

	it('stops once the content runs past the limit', async () => {
		expect(await inflate(gzipSync(content), content.length - 1)).toBeNull();
	});

	it('refuses bytes that are not gzip', async () => {
		expect(await inflate(content, content.length)).toBeNull();
	});
});

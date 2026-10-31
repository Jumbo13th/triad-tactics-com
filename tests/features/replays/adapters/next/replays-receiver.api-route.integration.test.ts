import { createHash, createHmac } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupIsolatedDb } from '../../../../fixtures/isolatedDb';
import { createSteamSession } from '../../../../fixtures/steamSession';

const ADMIN_STEAM_ID = '76561198012345678';
const USER_STEAM_ID = '76561198000000400';
const SECRET = 'replay-upload-secret-of-at-least-32-characters';
const SERVER = 'server-1';
const BUCKET = 'replays-test';
const SESSION = '20261031-201500-eden';

const sha256 = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');

type Harness = Awaited<ReturnType<typeof loadHarness>>;

async function loadHarness() {
	const files = await import('@/app/api/replays/v1/files/[sha]/route');
	const pieces = await import('@/app/api/replays/v1/files/[sha]/pieces/[index]/route');
	const games = await import('@/app/api/replays/v1/games/[session]/route');
	const admin = await import('@/app/api/admin/replays/route');
	const { getDb } = await import('../../../../fixtures/dbOperations');
	const { NextRequest } = await import('next/server');
	return {
		getFile: files.GET,
		commit: files.POST,
		putPiece: pieces.PUT,
		postGame: games.POST,
		listAdmin: admin.GET,
		getDb,
		NextRequest,
	};
}

type SignOptions = {
	timestamp?: number;
	server?: string;
	secret?: string;
	signedPath?: string;
	contentSha256?: string;
	contentLength?: string | null;
};

// Signed independently of the receiver, from the protocol text.
function signed(h: Harness, method: 'GET' | 'PUT' | 'POST', urlPath: string, body?: Buffer, options: SignOptions = {}) {
	const payload = body ?? Buffer.alloc(0);
	const timestamp = String(options.timestamp ?? Math.floor(Date.now() / 1000));
	const contentSha256 = options.contentSha256 ?? sha256(payload);
	const canonical = `${method}\n${options.signedPath ?? urlPath}\n${timestamp}\n${contentSha256}`;
	const headers: Record<string, string> = {
		'x-ll-server': options.server ?? SERVER,
		'x-ll-timestamp': timestamp,
		'x-ll-content-sha256': contentSha256,
		'x-ll-signature': createHmac('sha256', options.secret ?? SECRET).update(canonical).digest('hex'),
	};
	if (method !== 'GET') {
		const length = options.contentLength === undefined ? String(payload.length) : options.contentLength;
		if (length !== null) headers['content-length'] = length;
		headers['content-type'] = urlPath.includes('/pieces/') ? 'application/octet-stream' : 'application/json';
	}
	return new h.NextRequest(`http://localhost/api/replays/v1${urlPath}`, {
		method,
		headers,
		body: method === 'GET' ? undefined : new Uint8Array(payload),
	});
}

type TestFile = {
	sha256: string;
	size: number;
	encoded: Buffer;
	encodedSha256: string;
	pieces: Buffer[];
};

// The receiver joins whatever pieces it is given, so small files split anywhere stand in
// for 1.5 MB pieces.
function buildFile(content: string, pieceCount: number): TestFile {
	const raw = Buffer.from(content, 'utf8');
	const encoded = gzipSync(raw);
	const step = Math.ceil(encoded.length / pieceCount);
	const pieces = Array.from({ length: pieceCount }, (_, i) => encoded.subarray(i * step, (i + 1) * step));
	return { sha256: sha256(raw), size: raw.length, encoded, encodedSha256: sha256(encoded), pieces };
}

function segmentContent(segment: number, mission = 'Operation Example'): string {
	return [
		'LLR 1',
		`H session ${SESSION}`,
		`H segment ${segment}`,
		`H mission ${JSON.stringify(mission)}`,
		'H author "[ABC]Author"',
		'H world "{853E92315D1D9EFE}worlds/Eden/Eden.ent"',
		'H bounds 0 0 12800 12800',
		'H started 1793563200',
		'H end',
		'SNAP',
		...Array.from({ length: 200 }, (_, i) => `P ${i} ${4500 + i} ${6100 + segment} 41 87`),
		'SNAP-END',
		'',
	].join('\n');
}

function commitBody(file: TestFile, kind: 'segment' | 'identity' | 'stats', name: string, overrides: Record<string, unknown> = {}) {
	return Buffer.from(
		JSON.stringify({
			kind,
			session: SESSION,
			name,
			size: file.size,
			encoding: 'gzip',
			encodedSize: file.encoded.length,
			encodedSha256: file.encodedSha256,
			pieces: file.pieces.length,
			...overrides,
		})
	);
}

const fileParams = (sha: string) => ({ params: Promise.resolve({ sha }) });
const pieceParams = (sha: string, index: number) => ({ params: Promise.resolve({ sha, index: String(index) }) });
const gameParams = (session: string) => ({ params: Promise.resolve({ session }) });

async function sendAll(h: Harness, file: TestFile) {
	for (const [index, piece] of file.pieces.entries()) {
		const res = await h.putPiece(signed(h, 'PUT', `/files/${file.sha256}/pieces/${index}`, piece), pieceParams(file.sha256, index));
		expect([200, 201]).toContain(res.status);
	}
}

async function upload(h: Harness, file: TestFile, kind: 'segment' | 'identity' | 'stats', name: string) {
	await sendAll(h, file);
	const res = await h.commit(signed(h, 'POST', `/files/${file.sha256}`, commitBody(file, kind, name)), fileParams(file.sha256));
	expect(res.status).toBe(201);
}

function gameBody(post: Record<string, unknown>) {
	return Buffer.from(JSON.stringify({ session: SESSION, over: 'stopped', identity: null, stats: null, ...post }));
}

describe('replay receiver ll-upload/1 (handler integration)', () => {
	const stored = new Map<string, { body: Buffer; headers: http.IncomingHttpHeaders }>();
	let failingPuts = 0;
	let storage: http.Server;
	let piecesDir: string;
	let adminSid: string;
	let userSid: string;

	beforeAll(async () => {
		storage = http.createServer((req, res) => {
			const chunks: Buffer[] = [];
			req.on('data', (chunk: Buffer) => chunks.push(chunk));
			req.on('end', () => {
				if (req.method !== 'PUT') {
					res.statusCode = 405;
					res.end();
					return;
				}
				if (failingPuts > 0) {
					failingPuts--;
					res.statusCode = 500;
					res.end();
					return;
				}
				stored.set(req.url ?? '', { body: Buffer.concat(chunks), headers: req.headers });
				res.statusCode = 200;
				res.end();
			});
		});
		await new Promise<void>((resolve) => storage.listen(0, '127.0.0.1', resolve));
		const { port } = storage.address() as AddressInfo;

		piecesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'replay-pieces-'));
		process.env.REPLAY_UPLOAD_SECRET = SECRET;
		process.env.REPLAY_S3_ENDPOINT = `http://127.0.0.1:${port}`;
		process.env.REPLAY_S3_REGION = 'de';
		process.env.REPLAY_S3_BUCKET = BUCKET;
		process.env.REPLAY_S3_ACCESS_KEY_ID = BUCKET;
		process.env.REPLAY_S3_SECRET_ACCESS_KEY = 'storage-password';
		process.env.REPLAY_PIECES_DIR = piecesDir;

		await setupIsolatedDb({ prefix: 'triad-tactics-replays-test', adminSteamIds: ADMIN_STEAM_ID });
		const { dbOperations } = await import('../../../../fixtures/dbOperations');
		adminSid = createSteamSession(dbOperations, { steamid64: ADMIN_STEAM_ID, redirectPath: '/en/admin' });
		userSid = createSteamSession(dbOperations, { steamid64: USER_STEAM_ID, redirectPath: '/en' });
	});

	afterAll(async () => {
		await new Promise<void>((resolve) => storage.close(() => resolve()));
		fs.rmSync(piecesDir, { recursive: true, force: true });
	});

	describe('authentication', () => {
		const sha = sha256('anything');

		it('is off without a secret of at least 32 characters', async () => {
			const h = await loadHarness();
			process.env.REPLAY_UPLOAD_SECRET = 'short';
			try {
				const res = await h.getFile(signed(h, 'GET', `/files/${sha}`, undefined, { secret: 'short' }), fileParams(sha));
				expect(res.status).toBe(401);
			} finally {
				process.env.REPLAY_UPLOAD_SECRET = SECRET;
			}
		});

		it('refuses a malformed server identity', async () => {
			const h = await loadHarness();
			const res = await h.getFile(signed(h, 'GET', `/files/${sha}`, undefined, { server: 'Server_1' }), fileParams(sha));
			expect(res.status).toBe(401);
		});

		it('refuses a timestamp outside 300 seconds', async () => {
			const h = await loadHarness();
			const timestamp = Math.floor(Date.now() / 1000) - 301;
			const res = await h.getFile(signed(h, 'GET', `/files/${sha}`, undefined, { timestamp }), fileParams(sha));
			expect(res.status).toBe(401);
		});

		it('refuses another secret and a signature over another path', async () => {
			const h = await loadHarness();
			const wrongSecret = await h.getFile(
				signed(h, 'GET', `/files/${sha}`, undefined, { secret: 'another-secret-of-at-least-32-characters' }),
				fileParams(sha)
			);
			expect(wrongSecret.status).toBe(401);
			const otherPath = await h.getFile(
				signed(h, 'GET', `/files/${sha}`, undefined, { signedPath: `/files/${sha256('other')}` }),
				fileParams(sha)
			);
			expect(otherPath.status).toBe(401);
		});

		it('answers 413 from the declared length, before the signature', async () => {
			const h = await loadHarness();
			const tooLong = await h.putPiece(
				signed(h, 'PUT', `/files/${sha}/pieces/0`, Buffer.from('x'), { contentLength: '1500001', secret: 'wrong-secret-of-at-least-32-characters' }),
				pieceParams(sha, 0)
			);
			expect(tooLong.status).toBe(413);
			const noLength = await h.commit(signed(h, 'POST', `/files/${sha}`, Buffer.from('{}'), { contentLength: null }), fileParams(sha));
			expect(noLength.status).toBe(413);
		});

		it('answers 400 when the body does not match its signed hash', async () => {
			const h = await loadHarness();
			const res = await h.putPiece(
				signed(h, 'PUT', `/files/${sha}/pieces/0`, Buffer.from('piece'), { contentSha256: sha256('other piece') }),
				pieceParams(sha, 0)
			);
			expect(res.status).toBe(400);
		});
	});

	it('takes a file in pieces, stores it once and reports its state', async () => {
		const h = await loadHarness();
		const file = buildFile(segmentContent(1), 3);
		const at = `/files/${file.sha256}`;

		expect((await h.getFile(signed(h, 'GET', at), fileParams(file.sha256))).status).toBe(404);

		const first = await h.putPiece(signed(h, 'PUT', `${at}/pieces/1`, file.pieces[1]), pieceParams(file.sha256, 1));
		expect(first.status).toBe(201);
		const partial = await h.getFile(signed(h, 'GET', at), fileParams(file.sha256));
		expect(partial.status).toBe(200);
		expect(await partial.json()).toEqual({ state: 'partial', pieces: [1] });

		const early = await h.commit(signed(h, 'POST', at, commitBody(file, 'segment', `${SESSION}-1.llr`)), fileParams(file.sha256));
		expect(early.status).toBe(409);
		expect(await early.json()).toEqual({ missing: [0, 2] });

		await sendAll(h, file);
		const again = await h.putPiece(signed(h, 'PUT', `${at}/pieces/0`, file.pieces[0]), pieceParams(file.sha256, 0));
		expect(again.status).toBe(200);

		const commit = await h.commit(signed(h, 'POST', at, commitBody(file, 'segment', `${SESSION}-1.llr`)), fileParams(file.sha256));
		expect(commit.status).toBe(201);

		const object = stored.get(`/${BUCKET}/segment/${file.sha256}.gz`);
		expect(object?.body.equals(file.encoded)).toBe(true);
		expect(object?.headers['x-amz-content-sha256']).toBe(file.encodedSha256);
		expect(String(object?.headers.authorization)).toMatch(/^AWS4-HMAC-SHA256 Credential=replays-test\/\d{8}\/de\/s3\/aws4_request/);
		expect(fs.existsSync(path.join(piecesDir, file.sha256))).toBe(false);

		const complete = await h.getFile(signed(h, 'GET', at), fileParams(file.sha256));
		expect(await complete.json()).toEqual({ state: 'complete' });
		const recommit = await h.commit(signed(h, 'POST', at, commitBody(file, 'segment', `${SESSION}-1.llr`)), fileParams(file.sha256));
		expect(recommit.status).toBe(200);
		const latePiece = await h.putPiece(signed(h, 'PUT', `${at}/pieces/2`, file.pieces[2]), pieceParams(file.sha256, 2));
		expect(latePiece.status).toBe(200);

		const row = h.getDb().prepare('SELECT kind, server_id, header_json FROM replay_files WHERE sha256 = ?').get(file.sha256) as {
			kind: string;
			server_id: string;
			header_json: string;
		};
		expect(row.kind).toBe('segment');
		expect(row.server_id).toBe(SERVER);
		expect(JSON.parse(row.header_json)).toMatchObject({ mission: 'Operation Example', segment: 1, started: 1793563200 });
	});

	it('drops every piece of a file when a piece arrives with other bytes', async () => {
		const h = await loadHarness();
		const file = buildFile(segmentContent(7), 2);
		const at = `/files/${file.sha256}`;
		await sendAll(h, file);

		const conflict = await h.putPiece(signed(h, 'PUT', `${at}/pieces/1`, Buffer.from('other bytes')), pieceParams(file.sha256, 1));
		expect(conflict.status).toBe(409);
		expect((await h.getFile(signed(h, 'GET', at), fileParams(file.sha256))).status).toBe(404);
	});

	it('answers 422 and drops the pieces when the joined bytes do not match', async () => {
		const h = await loadHarness();
		const file = buildFile(segmentContent(8), 2);
		const at = `/files/${file.sha256}`;

		await sendAll(h, file);
		const wrongHash = await h.commit(
			signed(h, 'POST', at, commitBody(file, 'segment', 'x.llr', { encodedSha256: sha256('other') })),
			fileParams(file.sha256)
		);
		expect(wrongHash.status).toBe(422);
		expect((await h.getFile(signed(h, 'GET', at), fileParams(file.sha256))).status).toBe(404);

		// Pieces that inflate to other content than the identity names.
		const other = buildFile(segmentContent(9), 2);
		for (const [index, piece] of other.pieces.entries()) {
			await h.putPiece(signed(h, 'PUT', `${at}/pieces/${index}`, piece), pieceParams(file.sha256, index));
		}
		const wrongIdentity = await h.commit(
			signed(h, 'POST', at, commitBody(other, 'segment', 'x.llr')),
			fileParams(file.sha256)
		);
		expect(wrongIdentity.status).toBe(422);
		expect(stored.has(`/${BUCKET}/segment/${file.sha256}.gz`)).toBe(false);
	});

	it('keeps the pieces and answers 503 while storage fails', async () => {
		const h = await loadHarness();
		const file = buildFile(segmentContent(10), 2);
		const at = `/files/${file.sha256}`;
		await sendAll(h, file);

		failingPuts = 3;
		const failed = await h.commit(signed(h, 'POST', at, commitBody(file, 'segment', 'x.llr')), fileParams(file.sha256));
		expect(failed.status).toBe(503);
		const held = await h.getFile(signed(h, 'GET', at), fileParams(file.sha256));
		expect(await held.json()).toEqual({ state: 'partial', pieces: [0, 1] });

		failingPuts = 0;
		const retried = await h.commit(signed(h, 'POST', at, commitBody(file, 'segment', 'x.llr')), fileParams(file.sha256));
		expect(retried.status).toBe(201);
	});

	it('refuses everything with 503 while storage is not configured', async () => {
		const h = await loadHarness();
		const sha = sha256('unconfigured');
		delete process.env.REPLAY_S3_BUCKET;
		try {
			const res = await h.putPiece(signed(h, 'PUT', `/files/${sha}/pieces/0`, Buffer.from('piece')), pieceParams(sha, 0));
			expect(res.status).toBe(503);
		} finally {
			process.env.REPLAY_S3_BUCKET = BUCKET;
		}
	});

	it('records a game once its files are stored and replaces it on a later post', async () => {
		const h = await loadHarness();
		const segment1 = buildFile(segmentContent(1, 'Operation Game'), 2);
		const segment2 = buildFile(segmentContent(2, 'Operation Game'), 2);
		const identity = buildFile(`LLI 1\nH session ${SESSION}\nI 1 6f1a2b3c-4d5e-6f70-8192-a3b4c5d6e7f8\n`, 1);
		const stats = buildFile(JSON.stringify({ schema: 'll-stats/1', sessionId: SESSION, phase: 'final' }), 1);
		const gameAt = `/games/${SESSION}`;

		const early = await h.postGame(signed(h, 'POST', gameAt, gameBody({ segments: [segment1.sha256] })), gameParams(SESSION));
		expect(early.status).toBe(409);
		expect(await early.json()).toEqual({ missing: [segment1.sha256] });

		await upload(h, segment1, 'segment', `${SESSION}-1.llr`);
		await upload(h, identity, 'identity', `${SESSION}-identities.txt`);
		await upload(h, stats, 'stats', `${SESSION}-final.json`);

		const misnamed = await h.postGame(signed(h, 'POST', gameAt, gameBody({ segments: [stats.sha256] })), gameParams(SESSION));
		expect(misnamed.status).toBe(400);
		const otherSession = await h.postGame(
			signed(h, 'POST', '/games/20261031-201500-other', gameBody({ segments: [segment1.sha256] })),
			gameParams('20261031-201500-other')
		);
		expect(otherSession.status).toBe(400);

		const created = await h.postGame(
			signed(h, 'POST', gameAt, gameBody({ over: 'abandoned', segments: [segment1.sha256], identity: identity.sha256 })),
			gameParams(SESSION)
		);
		expect(created.status).toBe(201);

		await upload(h, segment2, 'segment', `${SESSION}-2.llr`);
		const replaced = await h.postGame(
			signed(
				h,
				'POST',
				gameAt,
				gameBody({ segments: [segment1.sha256, segment2.sha256], identity: identity.sha256, stats: stats.sha256 })
			),
			gameParams(SESSION)
		);
		expect(replaced.status).toBe(200);

		const row = h.getDb().prepare('SELECT * FROM replay_games WHERE session = ?').get(SESSION) as Record<string, unknown>;
		expect(row).toMatchObject({
			server_id: SERVER,
			over: 'stopped',
			segments_json: JSON.stringify([segment1.sha256, segment2.sha256]),
			identity_sha256: identity.sha256,
			stats_sha256: stats.sha256,
			post_count: 2,
		});

		const list = await h.listAdmin(
			new h.NextRequest('http://localhost/api/admin/replays', { headers: { cookie: `tt_steam_session=${adminSid}` } })
		);
		expect(list.status).toBe(200);
		const { games, hasMore } = (await list.json()) as { games: Record<string, unknown>[]; hasMore: boolean };
		expect(hasMore).toBe(false);
		expect(games).toHaveLength(1);
		expect(games[0]).toMatchObject({
			serverId: SERVER,
			session: SESSION,
			over: 'stopped',
			mission: 'Operation Game',
			startedAt: 1793563200,
			segmentCount: 2,
			size: segment1.size + segment2.size,
			hasIdentity: true,
			hasStats: true,
			postCount: 2,
		});
	});

	it('shows the game list to admins only', async () => {
		const h = await loadHarness();
		const anonymous = await h.listAdmin(new h.NextRequest('http://localhost/api/admin/replays'));
		expect(anonymous.status).toBe(401);
		const user = await h.listAdmin(
			new h.NextRequest('http://localhost/api/admin/replays', { headers: { cookie: `tt_steam_session=${userSid}` } })
		);
		expect(user.status).toBe(403);
	});
});

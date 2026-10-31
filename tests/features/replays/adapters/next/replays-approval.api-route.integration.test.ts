import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupIsolatedDb } from '../../../../fixtures/isolatedDb';
import {
	SESSION,
	UPLOAD_SECRET,
	buildFile,
	commitBody,
	gameBody,
	segmentContent,
	sha256,
	signedRequest,
	startFakeStorage,
	type FakeStorage,
	type TestFile,
} from '../../../../fixtures/replays';
import { createSteamSession } from '../../../../fixtures/steamSession';

const ADMIN_STEAM_ID = '76561198012345678';
const BUCKET = 'replays-approval-test';

async function loadHarness() {
	const files = await import('@/app/api/replays/v1/files/[sha]/route');
	const pieces = await import('@/app/api/replays/v1/files/[sha]/pieces/[index]/route');
	const games = await import('@/app/api/replays/v1/games/[session]/route');
	const admin = await import('@/app/api/admin/replays/route');
	const viewer = await import('@/app/api/replays/files/[sha]/route');
	const maps = await import('@/app/api/admin/replays/maps/route');
	const mapPieces = await import('@/app/api/admin/replays/maps/pieces/route');
	const { getDb } = await import('../../../../fixtures/dbOperations');
	const { publicReplaysDeps } = await import('@/features/replays/deps');
	const { listPublishedReplays, getReplayForViewer } = await import('@/features/replays/useCases/viewReplays');
	const { NextRequest } = await import('next/server');
	return {
		commit: files.POST,
		putPiece: pieces.PUT,
		postGame: games.POST,
		adminGet: admin.GET,
		adminPost: admin.POST,
		viewFile: viewer.GET,
		commitMap: maps.POST,
		putMapPiece: mapPieces.PUT,
		getDb,
		publicReplaysDeps,
		listPublishedReplays,
		getReplayForViewer,
		NextRequest,
	};
}

type Harness = Awaited<ReturnType<typeof loadHarness>>;

function signed(h: Harness, method: 'PUT' | 'POST', urlPath: string, body: Buffer) {
	return signedRequest(h.NextRequest, method, urlPath, body);
}

async function upload(h: Harness, file: TestFile, kind: 'segment' | 'identity' | 'stats', name: string) {
	for (const [index, piece] of file.pieces.entries()) {
		const res = await h.putPiece(signed(h, 'PUT', `/files/${file.sha256}/pieces/${index}`, piece), {
			params: Promise.resolve({ sha: file.sha256, index: String(index) }),
		});
		expect([200, 201]).toContain(res.status);
	}
	const res = await h.commit(signed(h, 'POST', `/files/${file.sha256}`, commitBody(file, kind, name)), {
		params: Promise.resolve({ sha: file.sha256 }),
	});
	expect(res.status).toBe(201);
}

function statsSnapshot(): string {
	return JSON.stringify({
		schema: 'll-stats/1',
		sessionId: SESSION,
		phase: 'approved',
		missionName: 'Operation Example',
		startedAt: '2026-10-31 20:15:00',
		winner: 'US',
		config: {},
		factions: ['US', 'USSR'],
		commanders: [],
		players: [{ guid: 'GUID-1', name: '[ABC]One', unitTag: '', faction: 'US', participated: true }],
		events: [],
		zones: [],
	});
}

describe('replay approval and viewing (handler integration)', () => {
	let storage: FakeStorage;
	let piecesDir: string;
	let adminSid: string;
	let missionId: number;
	let gameId: number;
	const segment = buildFile(segmentContent(1), 2);
	const identity = buildFile(`LLI 1\nH session ${SESSION}\nI 1 6f1a2b3c-4d5e-6f70-8192-a3b4c5d6e7f8\n`, 1);
	const stats = buildFile(statsSnapshot(), 1);

	function admin(h: Harness, method: 'GET' | 'POST', query = '', body?: unknown) {
		return new h.NextRequest(`http://localhost/api/admin/replays${query}`, {
			method,
			headers: { cookie: `tt_steam_session=${adminSid}`, 'content-type': 'application/json', origin: 'http://localhost' },
			body: body === undefined ? undefined : JSON.stringify(body),
		});
	}

	function view(h: Harness, sha: string, asAdmin = false) {
		return h.viewFile(
			new h.NextRequest(`http://localhost/api/replays/files/${sha}`, {
				headers: asAdmin ? { cookie: `tt_steam_session=${adminSid}` } : {},
			}),
			{ params: Promise.resolve({ sha }) }
		);
	}

	beforeAll(async () => {
		storage = await startFakeStorage();
		piecesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'replay-pieces-'));
		process.env.REPLAY_UPLOAD_SECRET = UPLOAD_SECRET;
		process.env.REPLAY_S3_ENDPOINT = storage.url;
		process.env.REPLAY_S3_REGION = 'de';
		process.env.REPLAY_S3_BUCKET = BUCKET;
		process.env.REPLAY_S3_ACCESS_KEY_ID = BUCKET;
		process.env.REPLAY_S3_SECRET_ACCESS_KEY = 'storage-password';
		process.env.REPLAY_PIECES_DIR = piecesDir;

		await setupIsolatedDb({ prefix: 'triad-tactics-replay-approval-test', adminSteamIds: ADMIN_STEAM_ID });
		const h = await loadHarness();
		const { dbOperations } = await import('../../../../fixtures/dbOperations');
		adminSid = createSteamSession(dbOperations, { steamid64: ADMIN_STEAM_ID, redirectPath: '/en/admin' });
		missionId = Number(
			h
				.getDb()
				.prepare(`INSERT INTO missions (status, title, short_code, slotting_json, starts_at) VALUES ('published', 'Operation Example', 'opex', '{"sides":[]}', '2026-10-31 20:00:00')`)
				.run().lastInsertRowid
		);

		await upload(h, segment, 'segment', `${SESSION}-1.llr`);
		await upload(h, identity, 'identity', `${SESSION}-identities.txt`);
		await upload(h, stats, 'stats', `${SESSION}-approved.json`);
		const posted = await h.postGame(
			signed(h, 'POST', `/games/${SESSION}`, gameBody({ segments: [segment.sha256], identity: identity.sha256, stats: stats.sha256 })),
			{ params: Promise.resolve({ session: SESSION }) }
		);
		expect(posted.status).toBe(201);
		gameId = (h.getDb().prepare('SELECT id FROM replay_games WHERE session = ?').get(SESSION) as { id: number }).id;
	});

	afterAll(async () => {
		await storage.close();
		fs.rmSync(piecesDir, { recursive: true, force: true });
	});

	it('keeps an unpublished game away from viewers but lets admins preview it', async () => {
		const h = await loadHarness();
		expect((await view(h, segment.sha256)).status).toBe(404);
		const preview = await view(h, segment.sha256, true);
		expect(preview.status).toBe(200);
		expect(preview.headers.get('cache-control')).toBe('private, no-store');
		expect(h.getReplayForViewer(h.publicReplaysDeps, { gameId, viewerIsAdmin: false })).toBeNull();
		expect(h.getReplayForViewer(h.publicReplaysDeps, { gameId, viewerIsAdmin: true })?.segments).toEqual([
			{ sha256: segment.sha256, size: segment.size },
		]);
	});

	it('refuses to publish or import statistics before the game is linked', async () => {
		const h = await loadHarness();
		const publish = await h.adminPost(admin(h, 'POST', '', { action: 'publish', gameId }));
		expect(publish.status).toBe(400);
		expect(await publish.json()).toEqual({ error: 'not_linked' });
		const importStats = await h.adminPost(admin(h, 'POST', '', { action: 'importStats', gameId }));
		expect(await importStats.json()).toEqual({ error: 'not_linked' });
	});

	it('links the game, imports its statistics as a draft and publishes it', async () => {
		const h = await loadHarness();
		const detail = await h.adminGet(admin(h, 'GET', `?gameId=${gameId}`));
		expect(detail.status).toBe(200);
		const before = (await detail.json()) as { game: Record<string, unknown>; missions: { id: number }[] };
		expect(before.game).toMatchObject({ id: gameId, hasStats: true, missionId: null, publishedAt: null, statistics: null, hasMap: false });
		expect(before.missions.map((m) => m.id)).toContain(missionId);

		const link = await h.adminPost(admin(h, 'POST', '', { action: 'link', gameId, missionId, episodeNumber: 2 }));
		expect(link.status).toBe(200);

		const imported = await h.adminPost(admin(h, 'POST', '', { action: 'importStats', gameId }));
		expect(imported.status).toBe(200);
		const { gameStatsId } = (await imported.json()) as { gameStatsId: number };
		const draft = h.getDb().prepare('SELECT mission_id, episode_number, status FROM game_stats WHERE id = ?').get(gameStatsId);
		expect(draft).toEqual({ mission_id: missionId, episode_number: 2, status: 'draft' });

		const published = await h.adminPost(admin(h, 'POST', '', { action: 'publish', gameId }));
		expect(published.status).toBe(200);
		// Tests run without a Discord token, so the post is skipped and stays owed.
		expect(await published.json()).toEqual({ ok: true, announcement: 'skipped' });

		const relink = await h.adminPost(admin(h, 'POST', '', { action: 'link', gameId, missionId, episodeNumber: 3 }));
		expect(await relink.json()).toEqual({ error: 'published' });

		const list = h.listPublishedReplays(h.publicReplaysDeps, { limit: 10, offset: 0 });
		expect(list).toHaveLength(1);
		expect(list[0]).toMatchObject({ id: gameId, missionTitle: 'Operation Example', missionShortCode: 'opex', episodeNumber: 2, statsId: null });
	});

	it('serves a published segment as its stored gzip, cacheable for good', async () => {
		const h = await loadHarness();
		const res = await view(h, segment.sha256);
		expect(res.status).toBe(200);
		expect(res.headers.get('content-encoding')).toBe('gzip');
		expect(res.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
		expect(res.headers.get('content-type')).toBe('text/plain; charset=utf-8');
		expect(Buffer.from(await res.arrayBuffer()).equals(segment.encoded)).toBe(true);
	});

	it('never serves identity or statistics files, published or not', async () => {
		const h = await loadHarness();
		expect((await view(h, identity.sha256)).status).toBe(404);
		expect((await view(h, stats.sha256)).status).toBe(404);
		expect((await view(h, identity.sha256, true)).status).toBe(404);
	});

	it('stores a terrain map from the admin page and serves it to viewers', async () => {
		const h = await loadHarness();
		const world = '{853E92315D1D9EFE}worlds/Eden/Eden.ent';
		const relief = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 '), Buffer.alloc(64, 7)]);
		const topoRaw = Buffer.concat([Buffer.from('TOPO'), Buffer.alloc(200, 1)]);
		const topoEncoded = gzipSync(topoRaw);
		const adminUpload = (url: string, body: Buffer, contentType: string) =>
			new h.NextRequest(url, {
				method: url.includes('/pieces') ? 'PUT' : 'POST',
				headers: {
					cookie: `tt_steam_session=${adminSid}`,
					origin: 'http://localhost',
					'content-type': contentType,
					'content-length': String(body.length),
				},
				body: new Uint8Array(body),
			});
		const send = async (kind: 'relief' | 'topo', identity: string, size: number, encoded: Buffer) => {
			const piece = await h.putMapPiece(
				adminUpload(`http://localhost/api/admin/replays/maps/pieces?sha=${identity}&index=0`, encoded, 'application/octet-stream')
			);
			expect(piece.status).toBe(201);
			const commit = Buffer.from(
				JSON.stringify({ kind, sha256: identity, size, encodedSize: encoded.length, encodedSha256: sha256(encoded), pieces: 1 })
			);
			return h.commitMap(adminUpload('http://localhost/api/admin/replays/maps', commit, 'application/json'));
		};

		// Bytes that are not an image are refused, whatever they are named.
		const notImage = Buffer.from('definitely not an image');
		expect((await send('relief', sha256(notImage), notImage.length, notImage)).status).toBe(422);

		expect((await send('relief', sha256(relief), relief.length, relief)).status).toBe(201);
		expect((await send('topo', sha256(topoRaw), topoRaw.length, topoEncoded)).status).toBe(201);
		const set = await h.adminPost(admin(h, 'POST', '', { action: 'setMap', world, relief: sha256(relief), topo: sha256(topoRaw) }));
		expect(set.status).toBe(200);

		const detail = (await (await h.adminGet(admin(h, 'GET', `?gameId=${gameId}`))).json()) as { game: { map: unknown; hasMap: boolean } };
		expect(detail.game).toMatchObject({ hasMap: true, map: { relief: true, topo: true } });

		const reliefRes = await view(h, sha256(relief));
		expect(reliefRes.status).toBe(200);
		expect(reliefRes.headers.get('content-type')).toBe('image/webp');
		expect(reliefRes.headers.get('content-encoding')).toBeNull();
		const topoRes = await view(h, sha256(topoRaw));
		expect(topoRes.headers.get('content-encoding')).toBe('gzip');
		expect(Buffer.from(await topoRes.arrayBuffer()).equals(topoEncoded)).toBe(true);
		expect(h.getReplayForViewer(h.publicReplaysDeps, { gameId, viewerIsAdmin: true })?.map).toEqual({
			relief: sha256(relief),
			topo: sha256(topoRaw),
		});
	});

	it('hides the game again when unpublished', async () => {
		const h = await loadHarness();
		const res = await h.adminPost(admin(h, 'POST', '', { action: 'unpublish', gameId }));
		expect(res.status).toBe(200);
		expect((await view(h, segment.sha256)).status).toBe(404);
		expect(h.listPublishedReplays(h.publicReplaysDeps, { limit: 10, offset: 0 })).toHaveLength(0);
	});
});

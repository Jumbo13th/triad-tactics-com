import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupIsolatedDb } from '../../../../fixtures/isolatedDb';
import {
	UPLOAD_SECRET,
	buildFile,
	commitBody,
	gameBody,
	signedRequest,
	startFakeStorage,
	type FakeStorage,
	type TestFile,
} from '../../../../fixtures/replays';
import { createSteamSession } from '../../../../fixtures/steamSession';

const ADMIN_STEAM_ID = '76561198012345679';
const BUCKET = 'replays-search-test';
const GUID_ONE = '6f1a2b3c-4d5e-6f70-8192-a3b4c5d6e7f8';
const GUID_TWO = '0b9c8d7e-6f5a-4b3c-2d1e-0f9a8b7c6d5e';
const EDEN = '{853E92315D1D9EFE}worlds/Eden/Eden.ent';
const ARLAND = '{0A1B2C3D4E5F6A7B}worlds/Arland/Thread.ent';

async function loadHarness() {
	const files = await import('@/app/api/replays/v1/files/[sha]/route');
	const pieces = await import('@/app/api/replays/v1/files/[sha]/pieces/[index]/route');
	const games = await import('@/app/api/replays/v1/games/[session]/route');
	const admin = await import('@/app/api/admin/replays/route');
	const { getDb } = await import('../../../../fixtures/dbOperations');
	const { adminReplaysDeps, publicReplaysDeps } = await import('@/features/replays/deps');
	const { searchPublishedReplays } = await import('@/features/replays/useCases/viewReplays');
	const { publishReplayGame } = await import('@/features/replays/useCases/reviewReplayGame');
	const episodes = await import('@/features/replays/useCases/findEpisodeReplays');
	const { NextRequest } = await import('next/server');
	return {
		commit: files.POST,
		putPiece: pieces.PUT,
		postGame: games.POST,
		adminPost: admin.POST,
		getDb,
		adminReplaysDeps,
		publicReplaysDeps,
		searchPublishedReplays,
		publishReplayGame,
		...episodes,
		NextRequest,
	};
}

type Harness = Awaited<ReturnType<typeof loadHarness>>;

function segmentText(session: string, world: string, started: number, records: string[]): string {
	return [
		'LLR 1',
		`H session ${session}`,
		'H segment 1',
		'H mission "As recorded"',
		`H world ${JSON.stringify(world)}`,
		`H started ${started}`,
		'H end',
		'T 0',
		...records,
		'',
	].join('\n');
}

function identityText(session: string, lines: string[]): string {
	return ['LLI 1', `H session ${session}`, ...lines, ''].join('\n');
}

async function upload(h: Harness, file: TestFile, kind: 'segment' | 'identity', session: string) {
	for (const [index, piece] of file.pieces.entries()) {
		const res = await h.putPiece(signedRequest(h.NextRequest, 'PUT', `/files/${file.sha256}/pieces/${index}`, piece), {
			params: Promise.resolve({ sha: file.sha256, index: String(index) }),
		});
		expect([200, 201]).toContain(res.status);
	}
	const body = commitBody(file, kind, `${session}-${kind}`, { session });
	const res = await h.commit(signedRequest(h.NextRequest, 'POST', `/files/${file.sha256}`, body), {
		params: Promise.resolve({ sha: file.sha256 }),
	});
	expect(res.status).toBe(201);
}

/** Receives a game from the host side and returns its id. */
async function receiveGame(h: Harness, session: string, segments: TestFile[], identity: TestFile | null): Promise<number> {
	for (const segment of segments) await upload(h, segment, 'segment', session);
	if (identity) await upload(h, identity, 'identity', session);
	const body = gameBody({ session, segments: segments.map((s) => s.sha256), identity: identity?.sha256 ?? null });
	const res = await h.postGame(signedRequest(h.NextRequest, 'POST', `/games/${session}`, body), {
		params: Promise.resolve({ session }),
	});
	expect(res.status).toBe(201);
	return (h.getDb().prepare('SELECT id FROM replay_games WHERE session = ?').get(session) as { id: number }).id;
}

type PlayerRow = { player_ref: number; identity_guid: string | null; name: string };

function indexedPlayers(h: Harness, gameId: number): PlayerRow[] {
	return h
		.getDb()
		.prepare('SELECT player_ref, identity_guid, name FROM replay_game_players WHERE game_id = ? ORDER BY player_ref, name')
		.all(gameId) as PlayerRow[];
}

describe('replay search, player index and episode links (handler integration)', () => {
	let storage: FakeStorage;
	let piecesDir: string;
	let adminSid: string;
	let opexId: number;
	let threadId: number;
	let edenGame: number;
	let arlandGame: number;
	let hiddenGame: number;

	function admin(h: Harness, body: unknown) {
		return new h.NextRequest('http://localhost/api/admin/replays', {
			method: 'POST',
			headers: { cookie: `tt_steam_session=${adminSid}`, 'content-type': 'application/json', origin: 'http://localhost' },
			body: JSON.stringify(body),
		});
	}

	async function linkAndPublish(h: Harness, gameId: number, missionId: number, episodeNumber: number) {
		expect((await h.adminPost(admin(h, { action: 'link', gameId, missionId, episodeNumber }))).status).toBe(200);
		const published = await h.adminPost(admin(h, { action: 'publish', gameId }));
		expect(published.status).toBe(200);
	}

	function search(h: Harness, query: string, page = 1) {
		return h.searchPublishedReplays(h.publicReplaysDeps, { query, page });
	}

	function ids(h: Harness, query: string): number[] {
		return search(h, query).replays.map((replay) => replay.id);
	}

	beforeAll(async () => {
		storage = await startFakeStorage();
		piecesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'replay-search-pieces-'));
		process.env.REPLAY_UPLOAD_SECRET = UPLOAD_SECRET;
		process.env.REPLAY_S3_ENDPOINT = storage.url;
		process.env.REPLAY_S3_REGION = 'de';
		process.env.REPLAY_S3_BUCKET = BUCKET;
		process.env.REPLAY_S3_ACCESS_KEY_ID = BUCKET;
		process.env.REPLAY_S3_SECRET_ACCESS_KEY = 'storage-password';
		process.env.REPLAY_PIECES_DIR = piecesDir;

		await setupIsolatedDb({ prefix: 'triad-tactics-replay-search-test', adminSteamIds: ADMIN_STEAM_ID });
		const h = await loadHarness();
		const { dbOperations } = await import('../../../../fixtures/dbOperations');
		adminSid = createSteamSession(dbOperations, { steamid64: ADMIN_STEAM_ID, redirectPath: '/en/admin' });

		const db = h.getDb();
		const mission = (title: string, shortCode: string) =>
			Number(
				db
					.prepare(`INSERT INTO missions (status, title, short_code, slotting_json) VALUES ('archived', ?, ?, '{"sides":[]}')`)
					.run(title, shortCode).lastInsertRowid
			);
		opexId = mission('Operation Example', 'opex');
		threadId = mission('Тонкая нить', 'thread');
		// Stored upper case: the site compares GUIDs case-insensitively.
		db.prepare(`INSERT INTO users (current_callsign, arma_guid) VALUES ('AlphaOne', ?)`).run(GUID_ONE.toUpperCase());

		// The last record has no line feed: a crash cut it off, so it is not part of the game.
		const edenSegment = buildFile(
			segmentText('20261031-201500-eden', EDEN, 1793563200, [
				'N 1 "[ABC]One"',
				'N 2 "Двойка"',
				'T 600',
				'N 2 "Двойка Второй"',
				'P 1 4500 6100 41 87',
			]) + 'N 3 "Cut Off"',
			2
		);
		const edenIdentity = buildFile(identityText('20261031-201500-eden', [`I 1 ${GUID_ONE}`, `I 2 ${GUID_TWO}`]), 1);
		edenGame = await receiveGame(h, '20261031-201500-eden', [edenSegment], edenIdentity);

		const arlandSegment = buildFile(segmentText('20261101-190000-thread', ARLAND, 1793647200, ['N 1 "Bravo"']), 1);
		arlandGame = await receiveGame(h, '20261101-190000-thread', [arlandSegment], null);

		const hiddenSegment = buildFile(segmentText('20261025-180000-eden', EDEN, 1792951200, ['N 1 "Hidden"']), 1);
		hiddenGame = await receiveGame(h, '20261025-180000-eden', [hiddenSegment], null);

		await linkAndPublish(h, edenGame, opexId, 2);
		await linkAndPublish(h, arlandGame, threadId, 1);
		expect((await h.adminPost(admin(h, { action: 'link', gameId: hiddenGame, missionId: opexId, episodeNumber: 1 }))).status).toBe(200);
	});

	afterAll(async () => {
		await storage.close();
		fs.rmSync(piecesDir, { recursive: true, force: true });
	});

	it('indexes who played a game when it is published', async () => {
		const h = await loadHarness();
		expect(indexedPlayers(h, edenGame)).toEqual([
			{ player_ref: 1, identity_guid: GUID_ONE, name: '[ABC]One' },
			{ player_ref: 2, identity_guid: GUID_TWO, name: 'Двойка' },
			{ player_ref: 2, identity_guid: GUID_TWO, name: 'Двойка Второй' },
		]);
		expect(indexedPlayers(h, arlandGame)).toEqual([{ player_ref: 1, identity_guid: null, name: 'Bravo' }]);
		expect(indexedPlayers(h, hiddenGame)).toEqual([]);
	});

	it('rebuilds the index when the game is published again', async () => {
		const h = await loadHarness();
		const before = indexedPlayers(h, edenGame);
		h.getDb().prepare('DELETE FROM replay_game_players WHERE game_id = ?').run(edenGame);
		h.getDb()
			.prepare(`INSERT INTO replay_game_players (game_id, player_ref, identity_guid, name) VALUES (?, 9, NULL, 'Stale')`)
			.run(edenGame);

		const republished = await h.adminPost(admin(h, { action: 'publish', gameId: edenGame }));
		expect(republished.status).toBe(200);
		expect(indexedPlayers(h, edenGame)).toEqual(before);
	});

	it('publishes a game whose players cannot be indexed', async () => {
		const h = await loadHarness();
		const segment = buildFile(segmentText('20261030-200000-eden', EDEN, 1793390400, ['N 1 "Lost"']), 1);
		const identity = buildFile(identityText('20261030-200000-eden', [`I 1 ${GUID_TWO}`]), 1);
		const gameId = await receiveGame(h, '20261030-200000-eden', [segment], identity);
		storage.stored.delete(`/${BUCKET}/identity/${identity.sha256}.gz`);
		expect((await h.adminPost(admin(h, { action: 'link', gameId, missionId: threadId, episodeNumber: 3 }))).status).toBe(200);

		const result = await h.publishReplayGame(h.adminReplaysDeps, { gameId, publishedBySteamid64: ADMIN_STEAM_ID });
		expect(result).toMatchObject({ result: 'published', players: { result: 'failed', reason: 'storage_unavailable' } });
		expect(indexedPlayers(h, gameId)).toEqual([]);
		expect(ids(h, 'e3')).toEqual([gameId]);

		h.getDb().prepare('UPDATE replay_games SET published_at = NULL WHERE id = ?').run(gameId);
	});

	it('finds games by mission title, ignoring case in any script', async () => {
		const h = await loadHarness();
		expect(ids(h, 'operation')).toEqual([edenGame]);
		expect(ids(h, 'EXAMPLE')).toEqual([edenGame]);
		expect(ids(h, 'ТОНКАЯ')).toEqual([arlandGame]);
		expect(ids(h, 'нить')).toEqual([arlandGame]);
	});

	it('finds games by terrain, the folder under worlds/ rather than the world file', async () => {
		const h = await loadHarness();
		expect(ids(h, 'arland')).toEqual([arlandGame]);
		expect(ids(h, 'EDEN')).toEqual([edenGame]);
		expect(ids(h, 'thread')).toEqual([]);
	});

	it('finds games by the current site callsign of a player', async () => {
		const h = await loadHarness();
		expect(ids(h, 'alphaone')).toEqual([edenGame]);
		expect(ids(h, 'ALPHA')).toEqual([edenGame]);

		h.getDb().prepare(`UPDATE users SET current_callsign = 'Renamed' WHERE current_callsign = 'AlphaOne'`).run();
		expect(ids(h, 'renamed')).toEqual([edenGame]);
		expect(ids(h, 'alphaone')).toEqual([]);
		h.getDb().prepare(`UPDATE users SET current_callsign = 'AlphaOne' WHERE current_callsign = 'Renamed'`).run();
	});

	it('finds games by any name the game displayed for a player', async () => {
		const h = await loadHarness();
		expect(ids(h, 'двойка')).toEqual([edenGame]);
		expect(ids(h, 'ВТОРОЙ')).toEqual([edenGame]);
		expect(ids(h, '[abc]')).toEqual([edenGame]);
		expect(ids(h, 'bravo')).toEqual([arlandGame]);
		expect(ids(h, 'cut')).toEqual([]);
		expect(ids(h, 'hidden')).toEqual([]);
	});

	it('finds games by episode number', async () => {
		const h = await loadHarness();
		expect(ids(h, '2')).toEqual([edenGame]);
		expect(ids(h, 'E1')).toEqual([arlandGame]);
		expect(ids(h, 'ep2')).toEqual([edenGame]);
		expect(ids(h, '7')).toEqual([]);
	});

	it('needs every word to match', async () => {
		const h = await loadHarness();
		expect(ids(h, 'eden двойка')).toEqual([edenGame]);
		expect(ids(h, 'arland двойка')).toEqual([]);
		expect(search(h, 'arland двойка')).toMatchObject({ query: 'arland двойка', total: 0, page: 1, totalPages: 1, replays: [] });
	});

	it('lists published games only, newest played first, with their player counts', async () => {
		const h = await loadHarness();
		const all = search(h, '');
		expect(all.total).toBe(2);
		expect(all.replays.map((replay) => [replay.id, replay.playerCount])).toEqual([
			[arlandGame, 1],
			[edenGame, 2],
		]);
		expect(all.replays[1]).toMatchObject({ missionTitle: 'Operation Example', episodeNumber: 2, world: EDEN, startedAt: 1793563200 });
	});

	it('pages through the results 24 at a time, keeping the search', async () => {
		const h = await loadHarness();
		const db = h.getDb();
		const bulkId = Number(
			db.prepare(`INSERT INTO missions (status, title, short_code, slotting_json) VALUES ('archived', 'Bulk Raid', 'bulk', '{}')`).run()
				.lastInsertRowid
		);
		const addFile = db.prepare(
			`INSERT INTO replay_files (sha256, kind, server_id, session, name, size, encoded_size, encoded_sha256, storage_key, header_json)
			VALUES (?, 'segment', 'server-1', ?, 'segment', 1, 1, ?, ?, ?)`
		);
		const addGame = db.prepare(
			`INSERT INTO replay_games (server_id, session, over, segments_json, mission_id, episode_number, published_at)
			VALUES ('server-1', ?, 'stopped', ?, ?, ?, CURRENT_TIMESTAMP)`
		);
		for (let n = 1; n <= 30; n++) {
			const sha = n.toString(16).padStart(64, '0');
			const session = `bulk-${n}`;
			addFile.run(sha, session, sha, `segment/${sha}.gz`, JSON.stringify({ world: EDEN, started: 1790000000 + n }));
			addGame.run(session, JSON.stringify([sha]), bulkId, n);
		}

		const first = search(h, 'bulk');
		expect(first).toMatchObject({ query: 'bulk', total: 30, page: 1, totalPages: 2 });
		expect(first.replays).toHaveLength(24);
		expect(first.replays[0].episodeNumber).toBe(30);

		const second = search(h, 'bulk', 2);
		expect(second).toMatchObject({ page: 2, totalPages: 2 });
		expect(second.replays.map((replay) => replay.episodeNumber)).toEqual([6, 5, 4, 3, 2, 1]);
		expect(search(h, 'bulk', 9)).toMatchObject({ page: 2 });

		const everything = search(h, '', 2);
		expect(everything).toMatchObject({ total: 32, page: 2, totalPages: 2 });
		expect(everything.replays).toHaveLength(8);
	});

	it('finds the published replay of a mission episode for the other pages', async () => {
		const h = await loadHarness();
		expect(h.findEpisodeReplayId(h.publicReplaysDeps, { missionId: opexId, episodeNumber: 2 })).toBe(edenGame);
		expect(h.findEpisodeReplayId(h.publicReplaysDeps, { missionId: opexId, episodeNumber: 1 })).toBeNull();
		expect(
			h.findEpisodeReplayIds(h.publicReplaysDeps, [
				{ missionId: threadId, episodeNumber: 1 },
				{ missionId: opexId, episodeNumber: 1 },
				{ missionId: opexId, episodeNumber: 2 },
			])
		).toEqual([arlandGame, null, edenGame]);
		expect(h.findEpisodeReplayIds(h.publicReplaysDeps, [])).toEqual([]);

		expect(h.listMissionReplays(h.publicReplaysDeps, { shortCode: 'opex' }).map((replay) => replay.id)).toEqual([edenGame]);
		expect(h.listMissionReplays(h.publicReplaysDeps, { shortCode: 'nope' })).toEqual([]);
	});

	it('links an episode published twice to its newest game, and the mission page to both', async () => {
		const h = await loadHarness();
		const segment = buildFile(segmentText('20261101-210000-thread', ARLAND, 1793654400, ['N 1 "Rerun"']), 1);
		const rerun = await receiveGame(h, '20261101-210000-thread', [segment], null);
		await linkAndPublish(h, rerun, threadId, 1);

		expect(h.findEpisodeReplayId(h.publicReplaysDeps, { missionId: threadId, episodeNumber: 1 })).toBe(rerun);
		expect(h.listMissionReplays(h.publicReplaysDeps, { shortCode: 'thread' }).map((replay) => replay.id)).toEqual([arlandGame, rerun]);
	});
});

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupIsolatedDb } from '../../../../fixtures/isolatedDb';
import {
	SESSION,
	UPLOAD_SECRET,
	buildFile,
	commitBody,
	gameBody,
	segmentContent,
	signedRequest,
	startFakeStorage,
	type FakeStorage,
	type TestFile,
} from '../../../../fixtures/replays';

const BUCKET = 'replays-filing-test';
// The fixture segment starts at 2026-11-01 20:00 UTC; the second game a week later.
const LATER_SESSION = '20261108-200000-eden';
const LATER_STARTED = 1_793_563_200 + 7 * 24 * 3600;

async function loadHarness() {
	const files = await import('@/app/api/replays/v1/files/[sha]/route');
	const pieces = await import('@/app/api/replays/v1/files/[sha]/pieces/[index]/route');
	const games = await import('@/app/api/replays/v1/games/[session]/route');
	const { getDb } = await import('../../../../fixtures/dbOperations');
	const { NextRequest } = await import('next/server');
	return { commit: files.POST, putPiece: pieces.PUT, postGame: games.POST, getDb, NextRequest };
}

type Harness = Awaited<ReturnType<typeof loadHarness>>;

async function upload(h: Harness, file: TestFile, kind: 'segment' | 'stats', name: string) {
	for (const [index, piece] of file.pieces.entries()) {
		const res = await h.putPiece(signedRequest(h.NextRequest, 'PUT', `/files/${file.sha256}/pieces/${index}`, piece), {
			params: Promise.resolve({ sha: file.sha256, index: String(index) }),
		});
		expect([200, 201]).toContain(res.status);
	}
	const res = await h.commit(signedRequest(h.NextRequest, 'POST', `/files/${file.sha256}`, commitBody(file, kind, name)), {
		params: Promise.resolve({ sha: file.sha256 }),
	});
	expect(res.status).toBe(201);
}

function statsSnapshot(session: string): string {
	return JSON.stringify({
		schema: 'll-stats/1',
		sessionId: session,
		phase: 'final',
		missionName: 'Operation Example',
		startedAt: '2026-11-01 20:25:00',
		winner: 'US',
		config: {},
		factions: ['US', 'USSR'],
		commanders: [],
		players: [{ guid: 'GUID-1', name: '[ABC]One', unitTag: '', faction: 'US', participated: true }],
		events: [],
		zones: [],
	});
}

describe('filing reported games (handler integration)', () => {
	let storage: FakeStorage;
	let piecesDir: string;
	let missionId: number;
	const segment = buildFile(segmentContent(1), 1);
	const stats = buildFile(statsSnapshot(SESSION), 1);

	// One mission is published at a time; those already played are archived.
	function insertMission(h: Harness, title: string, startsAt: string, status: 'published' | 'archived' = 'archived'): number {
		return Number(
			h
				.getDb()
				.prepare(`INSERT INTO missions (status, title, slotting_json, starts_at) VALUES (?, ?, '{"sides":[]}', ?)`)
				.run(status, title, startsAt).lastInsertRowid
		);
	}

	async function postGame(h: Harness, session: string, body: Record<string, unknown>) {
		return h.postGame(signedRequest(h.NextRequest, 'POST', `/games/${session}`, gameBody({ session, ...body })), {
			params: Promise.resolve({ session }),
		});
	}

	function gameRow(h: Harness, session: string) {
		return h.getDb().prepare('SELECT mission_id, episode_number FROM replay_games WHERE session = ?').get(session);
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

		await setupIsolatedDb({ prefix: 'triad-tactics-replay-filing-test' });
		const h = await loadHarness();
		insertMission(h, 'Last Week', '2026-10-25 19:30:00');
		missionId = insertMission(h, 'Operation Example', '2026-11-01 19:30:00', 'published');
		h.getDb()
			.prepare(
				`INSERT INTO mission_public_updates (mission_id, kind, episode_number, total_episodes, created_at)
				VALUES (?, 'game_started_wait_next_episode', 2, 2, '2026-11-01 20:25:00')`
			)
			.run(missionId);
	});

	afterAll(async () => {
		await storage.close();
		fs.rmSync(piecesDir, { recursive: true, force: true });
	});

	it('links a reported game to its mission and episode and drafts its statistics', async () => {
		const h = await loadHarness();
		await upload(h, segment, 'segment', `${SESSION}-1.llr`);
		await upload(h, stats, 'stats', `${SESSION}-final.json`);
		const res = await postGame(h, SESSION, { segments: [segment.sha256], stats: stats.sha256 });
		expect(res.status).toBe(201);

		expect(gameRow(h, SESSION)).toEqual({ mission_id: missionId, episode_number: 2 });
		const drafts = h.getDb().prepare('SELECT mission_id, episode_number, status, uploaded_by_steamid64 FROM game_stats').all();
		expect(drafts).toEqual([{ mission_id: missionId, episode_number: 2, status: 'draft', uploaded_by_steamid64: null }]);
	});

	it('keeps the episode draft when the server reports the game again', async () => {
		const h = await loadHarness();
		const before = h.getDb().prepare('SELECT id, updated_at FROM game_stats').all();
		const res = await postGame(h, SESSION, { segments: [segment.sha256], stats: stats.sha256 });
		expect(res.status).toBe(200);
		expect(h.getDb().prepare('SELECT id, updated_at FROM game_stats').all()).toEqual(before);
		expect(gameRow(h, SESSION)).toEqual({ mission_id: missionId, episode_number: 2 });
	});

	it('leaves a game unlinked when two missions were announced around it', async () => {
		const h = await loadHarness();
		insertMission(h, 'Side A', '2026-11-08 19:00:00');
		insertMission(h, 'Side B', '2026-11-08 20:30:00');
		const later = buildFile(
			segmentContent(1).replace(SESSION, LATER_SESSION).replace('H started 1793563200', `H started ${LATER_STARTED}`),
			1
		);
		const laterStats = buildFile(statsSnapshot(LATER_SESSION), 1);
		await upload(h, later, 'segment', `${LATER_SESSION}-1.llr`);
		await upload(h, laterStats, 'stats', `${LATER_SESSION}-final.json`);
		const res = await postGame(h, LATER_SESSION, { segments: [later.sha256], stats: laterStats.sha256 });
		expect(res.status).toBe(201);

		expect(gameRow(h, LATER_SESSION)).toEqual({ mission_id: null, episode_number: null });
		expect(h.getDb().prepare('SELECT COUNT(*) AS n FROM game_stats').get()).toEqual({ n: 1 });
	});
});

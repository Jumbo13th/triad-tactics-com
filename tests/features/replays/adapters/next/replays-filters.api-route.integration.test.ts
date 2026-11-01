import { createHash } from 'node:crypto';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { ReplayListFilters } from '@/features/replays/domain/search';
import { setupIsolatedDb } from '../../../../fixtures/isolatedDb';

// The route's page renders a client component; the test reads the result it is handed.
vi.mock('@/features/replays/ui/root', () => ({ ReplaysListPage: () => null }));

const EDEN = '{853E92315D1D9EFE}worlds/Eden/Eden.ent';
const ARLAND = '{0A1B2C3D4E5F6A7B}worlds/Arland/Thread.ent';
// Another mission world on the same terrain, its folder spelt in lower case.
const ARLAND_LOWER = 'worlds/arland/Other.ent';
const ARLAND_ADDON = '$TriadAddon:worlds/Arland/Corridor.ent';
const KUNAR = '$TriadAddon:worlds/Kunar/Kunar.ent';
const TAKISTAN = '{1B2C3D4E5F6A7B8C}worlds/Takistan/Takistan.ent';
const CAIN = '{2C3D4E5F6A7B8C9D}worlds/Cain/Cain.ent';

const at = (iso: string) => Date.parse(iso) / 1000;
const plain: ReplayListFilters = { query: '', terrain: '', mission: '', from: '', to: '', sort: 'newest' };

async function loadHarness() {
	const { getDb } = await import('../../../../fixtures/dbOperations');
	const { publicReplaysDeps } = await import('@/features/replays/deps');
	const { searchPublishedReplays } = await import('@/features/replays/useCases/viewReplays');
	const page = await import('@/app/[locale]/replays/page');
	return { getDb, publicReplaysDeps, searchPublishedReplays, ReplaysRoutePage: page.default };
}

type Harness = Awaited<ReturnType<typeof loadHarness>>;
type Db = ReturnType<Harness['getDb']>;

function addMission(db: Db, title: string, shortCode: string | null): number {
	return Number(
		db
			.prepare(`INSERT INTO missions (status, title, short_code, slotting_json) VALUES ('archived', ?, ?, '{"sides":[]}')`)
			.run(title, shortCode).lastInsertRowid
	);
}

type GameSpec = {
	session: string;
	missionId: number | null;
	episode: number;
	/** null: a first segment whose header could not be read. */
	header: { world: string; started: number } | null;
	players: number;
	published?: boolean;
};

function addGame(db: Db, game: GameSpec): number {
	const sha = createHash('sha256').update(game.session).digest('hex');
	db.prepare(
		`INSERT INTO replay_files (sha256, kind, server_id, session, name, size, encoded_size, encoded_sha256, storage_key, header_json)
		VALUES (?, 'segment', 'server-1', ?, 'segment', 1, 1, ?, ?, ?)`
	).run(sha, game.session, sha, `segment/${sha}.gz`, game.header ? JSON.stringify(game.header) : null);
	const id = Number(
		db
			.prepare(
				`INSERT INTO replay_games (server_id, session, over, segments_json, mission_id, episode_number, published_at)
				VALUES ('server-1', ?, 'stopped', ?, ?, ?, ?)`
			)
			.run(game.session, JSON.stringify([sha]), game.missionId, game.episode, game.published === false ? null : '2026-11-01 00:00:00')
			.lastInsertRowid
	);
	const addPlayer = db.prepare(`INSERT INTO replay_game_players (game_id, player_ref, identity_guid, name) VALUES (?, ?, ?, ?)`);
	for (let ref = 1; ref <= game.players; ref++) addPlayer.run(id, ref, `${game.session}-${ref}`, `Player ${ref}`);
	return id;
}

describe('replay list filters, sorts and facets (handler integration)', () => {
	const g: Record<string, number> = {};

	function search(h: Harness, filters: Partial<ReplayListFilters> = {}, page = 1, locale = 'en') {
		return h.searchPublishedReplays(h.publicReplaysDeps, { ...plain, ...filters, page, locale });
	}

	function ids(h: Harness, filters: Partial<ReplayListFilters> = {}): number[] {
		return search(h, filters).replays.map((replay) => replay.id);
	}

	beforeAll(async () => {
		await setupIsolatedDb({ prefix: 'triad-tactics-replay-filters-test' });
		const h = await loadHarness();
		const db = h.getDb();

		const opex = addMission(db, 'Operation Example', 'opex');
		const thread = addMission(db, 'Тонкая нить', 'thread');
		const alpha = addMission(db, 'Alpha Strike', 'alpha');
		// A mission run twice under one title, as the site's missions are.
		const gaw = addMission(db, 'Great African War', 'GAW');
		const llgaw = addMission(db, 'Great African War', 'LLGAW');
		const noCode = addMission(db, 'No Code', null);
		const unpublished = addMission(db, 'Unpublished Only', 'unpub');

		g.opex1 = addGame(db, { session: 'opex-1', missionId: opex, episode: 1, header: { world: EDEN, started: at('2026-10-01T19:00:00Z') }, players: 10 });
		g.llgaw1 = addGame(db, { session: 'llgaw-1', missionId: llgaw, episode: 1, header: { world: ARLAND_ADDON, started: at('2026-10-05T19:00:00Z') }, players: 12 });
		g.opex2 = addGame(db, { session: 'opex-2', missionId: opex, episode: 2, header: { world: EDEN, started: at('2026-10-08T19:00:00Z') }, players: 40 });
		g.gaw1 = addGame(db, { session: 'gaw-1', missionId: gaw, episode: 1, header: { world: EDEN, started: at('2026-10-08T21:00:00Z') }, players: 40 });
		// Late on the 15th in UTC: the 16th in the community's own evening.
		g.thread1 = addGame(db, { session: 'thread-1', missionId: thread, episode: 1, header: { world: ARLAND, started: at('2026-10-15T23:30:00Z') }, players: 25 });
		g.alpha1 = addGame(db, { session: 'alpha-1', missionId: alpha, episode: 1, header: { world: KUNAR, started: at('2026-10-20T18:00:00Z') }, players: 127 });
		g.noCode1 = addGame(db, { session: 'nocode-1', missionId: noCode, episode: 1, header: { world: EDEN, started: at('2026-10-22T19:00:00Z') }, players: 5 });
		g.thread2 = addGame(db, { session: 'thread-2', missionId: thread, episode: 2, header: { world: ARLAND_LOWER, started: at('2026-10-29T20:00:00Z') }, players: 8 });
		g.opex3 = addGame(db, { session: 'opex-3', missionId: opex, episode: 3, header: null, players: 0 });
		addGame(db, {
			session: 'unpub-1',
			missionId: unpublished,
			episode: 1,
			header: { world: TAKISTAN, started: at('2026-10-25T19:00:00Z') },
			players: 30,
			published: false,
		});
		// Published once, then its mission was deleted: the list no longer shows it.
		addGame(db, { session: 'orphan-1', missionId: null, episode: 1, header: { world: CAIN, started: at('2026-10-26T19:00:00Z') }, players: 3 });
	});

	it('offers the terrains and missions of the listed games only, in name order', async () => {
		const h = await loadHarness();
		expect(search(h).facets).toEqual({
			terrains: ['Arland', 'Eden', 'Kunar'],
			missions: [
				{ shortCode: 'alpha', title: 'Alpha Strike' },
				{ shortCode: 'GAW', title: 'Great African War' },
				{ shortCode: 'LLGAW', title: 'Great African War' },
				{ shortCode: 'opex', title: 'Operation Example' },
				{ shortCode: 'thread', title: 'Тонкая нить' },
			],
		});
		// A Russian reader's alphabet comes first for them.
		expect(search(h, {}, 1, 'ru').facets.missions.map((mission) => mission.shortCode)).toEqual(['thread', 'alpha', 'GAW', 'LLGAW', 'opex']);
	});

	it('sorts by when the games were played, newest first unless asked, undated games last', async () => {
		const h = await loadHarness();
		const newest = [g.thread2, g.noCode1, g.alpha1, g.thread1, g.gaw1, g.opex2, g.llgaw1, g.opex1, g.opex3];
		expect(ids(h)).toEqual(newest);
		expect(ids(h, { sort: 'oldest' })).toEqual([g.opex1, g.llgaw1, g.opex2, g.gaw1, g.thread1, g.alpha1, g.noCode1, g.thread2, g.opex3]);
		expect(search(h)).toMatchObject({ total: 9, page: 1, totalPages: 1, filters: plain });
	});

	it('sorts by player count, the newest first among equals', async () => {
		const h = await loadHarness();
		const result = search(h, { sort: 'players' });
		expect(result.replays.map((replay) => [replay.id, replay.playerCount])).toEqual([
			[g.alpha1, 127],
			[g.gaw1, 40],
			[g.opex2, 40],
			[g.thread1, 25],
			[g.llgaw1, 12],
			[g.opex1, 10],
			[g.thread2, 8],
			[g.noCode1, 5],
			[g.opex3, 0],
		]);
		expect(result.filters.sort).toBe('players');
	});

	it('filters by terrain whatever the case of the folder or of the request', async () => {
		const h = await loadHarness();
		expect(ids(h, { terrain: 'Arland' })).toEqual([g.thread2, g.thread1, g.llgaw1]);
		const shouted = search(h, { terrain: 'ARLAND' });
		expect(shouted.filters.terrain).toBe('Arland');
		expect(shouted.replays.map((replay) => replay.id)).toEqual([g.thread2, g.thread1, g.llgaw1]);
		expect(ids(h, { terrain: 'Eden' })).toEqual([g.noCode1, g.gaw1, g.opex2, g.opex1]);
		expect(search(h, { terrain: 'Kunar' })).toMatchObject({ total: 1, replays: [{ id: g.alpha1, world: KUNAR }] });
	});

	it('ignores a terrain no listed game is on', async () => {
		const h = await loadHarness();
		for (const terrain of ['Takistan', 'Cain', 'Arland.ent', 'Arl']) {
			const result = search(h, { terrain });
			expect(result.filters.terrain, terrain).toBe('');
			expect(result.total, terrain).toBe(9);
		}
	});

	it('filters by mission short code, ignoring case, and ignores codes without listed games', async () => {
		const h = await loadHarness();
		expect(ids(h, { mission: 'thread' })).toEqual([g.thread2, g.thread1]);
		expect(ids(h, { mission: 'opex' })).toEqual([g.opex2, g.opex1, g.opex3]);
		const lower = search(h, { mission: 'gaw' });
		expect(lower.filters.mission).toBe('GAW');
		expect(lower.replays.map((replay) => replay.id)).toEqual([g.gaw1]);
		expect(ids(h, { mission: 'LLGAW' })).toEqual([g.llgaw1]);
		for (const mission of ['unpub', 'nocode', 'nope']) {
			expect(search(h, { mission }), mission).toMatchObject({ filters: { mission: '' }, total: 9 });
		}
	});

	it('filters by the UTC days played, both ends included', async () => {
		const h = await loadHarness();
		expect(ids(h, { from: '2026-10-08' })).toEqual([g.thread2, g.noCode1, g.alpha1, g.thread1, g.gaw1, g.opex2]);
		expect(ids(h, { to: '2026-10-15' })).toEqual([g.thread1, g.gaw1, g.opex2, g.llgaw1, g.opex1]);
		expect(ids(h, { from: '2026-10-16' })).not.toContain(g.thread1);
		expect(ids(h, { from: '2026-10-08', to: '2026-10-08' })).toEqual([g.gaw1, g.opex2]);
		expect(ids(h, { from: '2026-11-01' })).toEqual([]);
	});

	it('turns a backwards range around and says so in the filters it applied', async () => {
		const h = await loadHarness();
		const result = search(h, { from: '2026-10-15', to: '2026-10-08' });
		expect(result.filters).toMatchObject({ from: '2026-10-08', to: '2026-10-15' });
		expect(result.replays.map((replay) => replay.id)).toEqual([g.thread1, g.gaw1, g.opex2]);
	});

	it('combines the filters with each other and with the search', async () => {
		const h = await loadHarness();
		expect(ids(h, { query: 'operation', terrain: 'Eden' })).toEqual([g.opex2, g.opex1]);
		expect(ids(h, { query: 'нить', from: '2026-10-16' })).toEqual([g.thread2]);
		expect(ids(h, { query: 'great', sort: 'players' })).toEqual([g.gaw1, g.llgaw1]);
		expect(ids(h, { query: 'e1', terrain: 'arland' })).toEqual([g.thread1, g.llgaw1]);
		expect(ids(h, { query: 'Player', mission: 'opex', to: '2026-10-05', sort: 'oldest' })).toEqual([g.opex1]);
		expect(search(h, { query: 'eden', mission: 'thread' })).toMatchObject({ total: 0, totalPages: 1, page: 1, replays: [] });
		expect(search(h, { mission: 'opex', terrain: 'Arland' })).toMatchObject({ total: 0, replays: [] });
	});

	it('counts and pages the filtered games', async () => {
		const h = await loadHarness();
		expect(search(h, { terrain: 'Eden' }, 4)).toMatchObject({ total: 4, page: 1, totalPages: 1 });
	});

	it('reads the filters from the address in the route', async () => {
		const h = await loadHarness();
		const element = await h.ReplaysRoutePage({
			params: Promise.resolve({ locale: 'ru' }),
			searchParams: Promise.resolve({ q: ' great ', terrain: 'arland', mission: ['llgaw', 'gaw'], sort: 'players', from: '2026-02-30', page: '3' }),
		});
		const { result } = element.props as { result: ReturnType<typeof search> };
		expect(result.filters).toEqual({ query: 'great', terrain: 'Arland', mission: 'LLGAW', from: '', to: '', sort: 'players' });
		expect(result).toMatchObject({ page: 1, total: 1, replays: [{ id: g.llgaw1 }] });
		expect(result.facets.missions[0].shortCode).toBe('thread');
	});
});

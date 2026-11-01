import { getDb } from '@/platform/db/connection';
import { parseDateTimeValue } from '@/platform/dateTime';
import type { ReplayPlayer } from '../domain/players';
import type { ReplayFileKind, ReplayGameEnding } from '../domain/protocol';
import type { ReplayFacets, ReplayGameFilter, ReplaySearchTerm, ReplaySort } from '../domain/search';
import type { SegmentHeader } from '../domain/segmentHeader';
import { terrainName } from '../domain/terrain';
import type {
	EpisodeReplay,
	PublicReplayListItem,
	PublicReplaySearchItem,
	ReplayEpisodeStats,
	ReplayFile,
	ReplayGameInput,
	ReplayGameListItem,
	ReplayGameRecord,
	ReplayMap,
	ReplayMission,
} from '../domain/types';

type FileRow = {
	sha256: string;
	kind: ReplayFileKind;
	server_id: string;
	session: string;
	name: string;
	size: number;
	encoded_size: number;
	encoded_sha256: string;
	storage_key: string;
	header_json: string | null;
};

type GameListRow = {
	id: number;
	server_id: string;
	session: string;
	over: ReplayGameEnding;
	identity_sha256: string | null;
	stats_sha256: string | null;
	post_count: number;
	first_posted_at: string;
	last_posted_at: string;
	segment_count: number;
	size: number;
	encoded_size: number;
	first_header_json: string | null;
	mission_id: number | null;
	mission_title: string | null;
	episode_number: number | null;
	published_at: string | null;
	stats_status: 'draft' | 'published' | null;
};

type GameRow = {
	id: number;
	server_id: string;
	session: string;
	over: ReplayGameEnding;
	segments_json: string;
	identity_sha256: string | null;
	stats_sha256: string | null;
	mission_id: number | null;
	episode_number: number | null;
	published_at: string | null;
	announced_at: string | null;
};

type PublishedRow = {
	id: number;
	mission_title: string;
	mission_short_code: string | null;
	episode_number: number;
	published_at: string;
	first_header_json: string | null;
	stats_id: number | null;
};

type SearchRow = PublishedRow & { player_count: number };

const FILE_COLUMNS = `sha256, kind, server_id, session, name, size, encoded_size, encoded_sha256, storage_key, header_json`;

// The first segment's header names the mission, world and start time of the game.
const FIRST_HEADER = `(SELECT f.header_json FROM replay_files f
	WHERE f.sha256 = json_extract(g.segments_json, '$[0]'))`;

const GAME_LIST_SELECT = `
	SELECT
		g.id, g.server_id, g.session, g.over, g.identity_sha256, g.stats_sha256,
		g.post_count, g.first_posted_at, g.last_posted_at,
		g.mission_id, m.title AS mission_title, g.episode_number, g.published_at,
		(SELECT s.status FROM game_stats s
			WHERE s.mission_id = g.mission_id AND s.episode_number = g.episode_number) AS stats_status,
		(SELECT COUNT(*) FROM json_each(g.segments_json)) AS segment_count,
		(SELECT COALESCE(SUM(f.size), 0) FROM json_each(g.segments_json) j
			JOIN replay_files f ON f.sha256 = j.value) AS size,
		(SELECT COALESCE(SUM(f.encoded_size), 0) FROM json_each(g.segments_json) j
			JOIN replay_files f ON f.sha256 = j.value) AS encoded_size,
		${FIRST_HEADER} AS first_header_json
	FROM replay_games g
	LEFT JOIN missions m ON m.id = g.mission_id`;

// Statistics are linked by mission episode and shown only once published.
const PUBLISHED_STATS_ID = `(SELECT s.id FROM game_stats s
	WHERE s.mission_id = g.mission_id AND s.episode_number = g.episode_number
		AND s.status = 'published')`;

const PUBLISHED_SELECT = `
	SELECT
		g.id, m.title AS mission_title, m.short_code AS mission_short_code,
		g.episode_number, g.published_at,
		${FIRST_HEADER} AS first_header_json,
		${PUBLISHED_STATS_ID} AS stats_id
	FROM replay_games g
	JOIN missions m ON m.id = g.mission_id
	WHERE g.published_at IS NOT NULL AND g.episode_number IS NOT NULL`;

// The published games with their first header, kept under the name g so that search
// conditions and subqueries read as they do against replay_games.
const PUBLISHED_GAMES = `
	WITH published AS (
		SELECT g.id, g.mission_id, g.episode_number, g.published_at, ${FIRST_HEADER} AS first_header_json
		FROM replay_games g
		WHERE g.published_at IS NOT NULL AND g.episode_number IS NOT NULL
	)`;

const STARTED = `json_extract(g.first_header_json, '$.started')`;
const TERRAIN = `replay_terrain(json_extract(g.first_header_json, '$.world'))`;

// A player who reconnected under another reference still has one identity.
const PLAYER_COUNT = `(SELECT COUNT(DISTINCT COALESCE(p.identity_guid, 'ref ' || p.player_ref))
	FROM replay_game_players p WHERE p.game_id = g.id)`;

// A game published late still sits at the date it was played. A game without a start time
// is listed last either way.
const SEARCH_ORDER: Record<ReplaySort, string> = {
	newest: `${STARTED} DESC NULLS LAST, g.id DESC`,
	oldest: `${STARTED} ASC NULLS LAST, g.id ASC`,
	players: `player_count DESC, ${STARTED} DESC NULLS LAST, g.id DESC`,
};

// A player matches by an in-game name, or through the identity GUID by the callsign of the
// site account it belongs to. The callsign lookup does not depend on the game, so SQLite
// runs it once per statement.
const PLAYER_MATCH = `EXISTS (SELECT 1 FROM replay_game_players p WHERE p.game_id = g.id AND (
	instr(replay_fold(p.name), ?) > 0
	OR p.identity_guid IN (SELECT LOWER(u.arma_guid) FROM users u
		WHERE u.arma_guid IS NOT NULL AND instr(replay_fold(u.current_callsign), ?) > 0)))`;

type Db = ReturnType<typeof getDb>;
const searchReady = new WeakSet<Db>();

// SQLite folds case for ASCII only, while mission titles and in-game names are often
// Cyrillic, so search compares text lowercased by JavaScript, as the terms themselves are.
function searchDb(): Db {
	const db = getDb();
	if (!searchReady.has(db)) {
		db.function('replay_fold', { deterministic: true }, (text: unknown) => (typeof text === 'string' ? text.toLowerCase() : null));
		db.function('replay_terrain', { deterministic: true }, (world: unknown) => (typeof world === 'string' ? terrainName(world) : null));
		searchReady.add(db);
	}
	return db;
}

function termCondition(term: ReplaySearchTerm): { sql: string; params: (string | number)[] } {
	switch (term.kind) {
		case 'episode':
			return { sql: 'g.episode_number = ?', params: [term.episode] };
		case 'number':
			return { sql: '(g.episode_number = ? OR instr(replay_fold(m.title), ?) > 0)', params: [term.episode, term.text] };
		case 'text':
			return {
				sql: `(instr(replay_fold(m.title), ?) > 0
					OR instr(replay_fold(${TERRAIN}), ?) > 0
					OR ${PLAYER_MATCH})`,
				params: [term.text, term.text, term.text, term.text],
			};
	}
}

function gameConditions(filter: ReplayGameFilter): { where: string; params: (string | number)[] } {
	const conditions = filter.search.terms.map(termCondition);
	if (filter.terrain !== null) conditions.push({ sql: `replay_fold(${TERRAIN}) = ?`, params: [filter.terrain.toLowerCase()] });
	// Short codes are ASCII, which SQLite folds itself.
	if (filter.missionShortCode !== null) conditions.push({ sql: 'LOWER(m.short_code) = LOWER(?)', params: [filter.missionShortCode] });
	if (filter.startedFrom !== null) conditions.push({ sql: `${STARTED} >= ?`, params: [filter.startedFrom] });
	if (filter.startedBefore !== null) conditions.push({ sql: `${STARTED} < ?`, params: [filter.startedBefore] });
	return {
		where: conditions.length === 0 ? '' : `WHERE ${conditions.map((condition) => condition.sql).join(' AND ')}`,
		params: conditions.flatMap((condition) => condition.params),
	};
}

function parseHeader(json: string | null): SegmentHeader | null {
	if (!json) return null;
	try {
		return JSON.parse(json) as SegmentHeader;
	} catch {
		return null;
	}
}

function toFile(row: FileRow): ReplayFile {
	return {
		sha256: row.sha256,
		kind: row.kind,
		serverId: row.server_id,
		session: row.session,
		name: row.name,
		size: row.size,
		encodedSize: row.encoded_size,
		encodedSha256: row.encoded_sha256,
		storageKey: row.storage_key,
		header: parseHeader(row.header_json),
	};
}

function toListItem(row: GameListRow): ReplayGameListItem {
	const header = parseHeader(row.first_header_json);
	return {
		id: row.id,
		serverId: row.server_id,
		session: row.session,
		over: row.over,
		mission: header?.mission || null,
		world: header?.world || null,
		startedAt: header?.started ?? null,
		segmentCount: row.segment_count,
		size: row.size,
		encodedSize: row.encoded_size,
		hasIdentity: row.identity_sha256 !== null,
		hasStats: row.stats_sha256 !== null,
		postCount: row.post_count,
		firstPostedAt: row.first_posted_at,
		lastPostedAt: row.last_posted_at,
		missionId: row.mission_id,
		missionTitle: row.mission_title,
		episodeNumber: row.episode_number,
		publishedAt: row.published_at,
		statsStatus: row.stats_status,
	};
}

function toPublished(row: PublishedRow): PublicReplayListItem {
	const header = parseHeader(row.first_header_json);
	return {
		id: row.id,
		missionTitle: row.mission_title,
		missionShortCode: row.mission_short_code,
		episodeNumber: row.episode_number,
		world: header?.world || null,
		startedAt: header?.started ?? null,
		publishedAt: row.published_at,
		statsId: row.stats_id,
	};
}

export function findFile(sha256: string): ReplayFile | null {
	const row = getDb().prepare(`SELECT ${FILE_COLUMNS} FROM replay_files WHERE sha256 = ?`).get(sha256) as FileRow | undefined;
	return row ? toFile(row) : null;
}

export function findFiles(sha256s: string[]): ReplayFile[] {
	if (sha256s.length === 0) return [];
	// json_each keeps one statement for any number of names.
	const rows = getDb()
		.prepare(`SELECT ${FILE_COLUMNS} FROM replay_files WHERE sha256 IN (SELECT value FROM json_each(?))`)
		.all(JSON.stringify(sha256s)) as FileRow[];
	return rows.map(toFile);
}

export function insertFile(file: ReplayFile): void {
	getDb()
		.prepare(
			`INSERT OR IGNORE INTO replay_files (${FILE_COLUMNS})
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
		)
		.run(
			file.sha256,
			file.kind,
			file.serverId,
			file.session,
			file.name,
			file.size,
			file.encodedSize,
			file.encodedSha256,
			file.storageKey,
			file.header ? JSON.stringify(file.header) : null
		);
}

export function saveGame(game: ReplayGameInput): { id: number; created: boolean } {
	const row = getDb()
		.prepare(
			`INSERT INTO replay_games (server_id, session, over, segments_json, identity_sha256, stats_sha256)
			VALUES (?, ?, ?, ?, ?, ?)
			ON CONFLICT(server_id, session) DO UPDATE SET
				over = excluded.over,
				segments_json = excluded.segments_json,
				identity_sha256 = excluded.identity_sha256,
				stats_sha256 = excluded.stats_sha256,
				post_count = replay_games.post_count + 1,
				last_posted_at = CURRENT_TIMESTAMP
			RETURNING id, post_count`
		)
		.get(game.serverId, game.session, game.over, JSON.stringify(game.segments), game.identity, game.stats) as {
		id: number;
		post_count: number;
	};
	return { id: row.id, created: row.post_count === 1 };
}

export function listGames(input: { limit: number; offset: number }): ReplayGameListItem[] {
	const rows = getDb()
		.prepare(`${GAME_LIST_SELECT} ORDER BY g.id DESC LIMIT ? OFFSET ?`)
		.all(input.limit, input.offset) as GameListRow[];
	return rows.map(toListItem);
}

export function findGameListItem(id: number): ReplayGameListItem | null {
	const row = getDb().prepare(`${GAME_LIST_SELECT} WHERE g.id = ?`).get(id) as GameListRow | undefined;
	return row ? toListItem(row) : null;
}

const GAME_SELECT = `SELECT id, server_id, session, over, segments_json, identity_sha256, stats_sha256,
	mission_id, episode_number, published_at, announced_at
FROM replay_games`;

export function findGame(id: number): ReplayGameRecord | null {
	return toGameRecord(getDb().prepare(`${GAME_SELECT} WHERE id = ?`).get(id) as GameRow | undefined);
}

export function findGameBySession(serverId: string, session: string): ReplayGameRecord | null {
	return toGameRecord(getDb().prepare(`${GAME_SELECT} WHERE server_id = ? AND session = ?`).get(serverId, session) as GameRow | undefined);
}

function toGameRecord(row: GameRow | undefined): ReplayGameRecord | null {
	if (!row) return null;
	return {
		id: row.id,
		serverId: row.server_id,
		session: row.session,
		over: row.over,
		segments: JSON.parse(row.segments_json) as string[],
		identity: row.identity_sha256,
		stats: row.stats_sha256,
		missionId: row.mission_id,
		episodeNumber: row.episode_number,
		publishedAt: row.published_at,
		announcedAt: row.announced_at,
	};
}

export function listMissions(): ReplayMission[] {
	const rows = getDb()
		.prepare(`SELECT id, title, short_code, starts_at FROM missions ORDER BY id DESC`)
		.all() as { id: number; title: string; short_code: string | null; starts_at: string | null }[];
	return rows.map((row) => ({ id: row.id, title: row.title, shortCode: row.short_code, startsAt: row.starts_at }));
}

export function findMission(id: number): ReplayMission | null {
	const row = getDb().prepare(`SELECT id, title, short_code, starts_at FROM missions WHERE id = ?`).get(id) as
		| { id: number; title: string; short_code: string | null; starts_at: string | null }
		| undefined;
	return row ? { id: row.id, title: row.title, shortCode: row.short_code, startsAt: row.starts_at } : null;
}

function epochSeconds(value: string): number | null {
	const date = parseDateTimeValue(value);
	return date ? Math.floor(date.getTime() / 1000) : null;
}

export function listScheduledMissions(): { id: number; startsAt: number }[] {
	const rows = getDb()
		.prepare(`SELECT id, starts_at FROM missions WHERE status != 'draft' AND starts_at IS NOT NULL`)
		.all() as { id: number; starts_at: string }[];
	return rows.flatMap((row) => {
		const startsAt = epochSeconds(row.starts_at);
		return startsAt === null ? [] : [{ id: row.id, startsAt }];
	});
}

export function listEpisodeStartPosts(missionId: number): { episodeNumber: number; at: number }[] {
	const rows = getDb()
		.prepare(
			`SELECT episode_number, created_at FROM mission_public_updates
			WHERE mission_id = ? AND kind = 'game_started_wait_next_episode' AND episode_number IS NOT NULL AND created_at IS NOT NULL`
		)
		.all(missionId) as { episode_number: number; created_at: string }[];
	return rows.flatMap((row) => {
		const at = epochSeconds(row.created_at);
		return at === null ? [] : [{ episodeNumber: row.episode_number, at }];
	});
}

export function countMissionEpisodes(missionId: number): number {
	const row = getDb()
		.prepare(
			`SELECT MAX(n) AS n FROM (
				SELECT MAX(episode_number) AS n FROM mission_episode_slotting WHERE mission_id = ?
				UNION ALL SELECT MAX(episode_number) FROM mission_unit_assignments WHERE mission_id = ?
				UNION ALL SELECT MAX(total_episodes) FROM mission_public_updates WHERE mission_id = ?
			)`
		)
		.get(missionId, missionId, missionId) as { n: number | null };
	return row.n ?? 1;
}

export function linkGame(id: number, missionId: number, episodeNumber: number): void {
	getDb().prepare(`UPDATE replay_games SET mission_id = ?, episode_number = ? WHERE id = ?`).run(missionId, episodeNumber, id);
}

export function setPublished(id: number, publishedBySteamid64: string | null): void {
	if (publishedBySteamid64 === null) {
		getDb().prepare(`UPDATE replay_games SET published_at = NULL, published_by_steamid64 = NULL WHERE id = ?`).run(id);
		return;
	}
	getDb()
		.prepare(
			`UPDATE replay_games SET published_at = COALESCE(published_at, CURRENT_TIMESTAMP), published_by_steamid64 = ?
			WHERE id = ?`
		)
		.run(publishedBySteamid64, id);
}

export function markAnnounced(id: number): void {
	getDb().prepare(`UPDATE replay_games SET announced_at = CURRENT_TIMESTAMP WHERE id = ?`).run(id);
}

export function findEpisodeStats(missionId: number, episodeNumber: number): ReplayEpisodeStats | null {
	const row = getDb()
		.prepare(`SELECT id, status FROM game_stats WHERE mission_id = ? AND episode_number = ?`)
		.get(missionId, episodeNumber) as { id: number; status: 'draft' | 'published' } | undefined;
	return row ?? null;
}

export function searchPublishedGames(input: {
	filter: ReplayGameFilter;
	sort: ReplaySort;
	limit: number;
	offset: number;
}): PublicReplaySearchItem[] {
	const conditions = gameConditions(input.filter);
	const rows = searchDb()
		.prepare(
			`${PUBLISHED_GAMES}
			SELECT
				g.id, m.title AS mission_title, m.short_code AS mission_short_code,
				g.episode_number, g.published_at, g.first_header_json,
				${PUBLISHED_STATS_ID} AS stats_id,
				${PLAYER_COUNT} AS player_count
			FROM published g
			JOIN missions m ON m.id = g.mission_id
			${conditions.where}
			ORDER BY ${SEARCH_ORDER[input.sort]}
			LIMIT ? OFFSET ?`
		)
		.all(...conditions.params, input.limit, input.offset) as SearchRow[];
	return rows.map((row) => ({ ...toPublished(row), playerCount: row.player_count }));
}

export function countPublishedGames(filter: ReplayGameFilter): number {
	const conditions = gameConditions(filter);
	const row = searchDb()
		.prepare(`${PUBLISHED_GAMES} SELECT COUNT(*) AS total FROM published g JOIN missions m ON m.id = g.mission_id ${conditions.where}`)
		.get(...conditions.params) as { total: number };
	return row.total;
}

export function listPublishedFacets(): ReplayFacets {
	const db = searchDb();
	const terrainRows = db
		.prepare(`${PUBLISHED_GAMES} SELECT DISTINCT ${TERRAIN} AS terrain FROM published g JOIN missions m ON m.id = g.mission_id`)
		.all() as { terrain: string | null }[];
	// Two mission worlds may spell one terrain's folder differently; the filter ignores case,
	// so the list names it once, capitals first.
	const terrains = new Map<string, string>();
	for (const name of terrainRows.map((row) => row.terrain ?? '').sort()) {
		if (name && !terrains.has(name.toLowerCase())) terrains.set(name.toLowerCase(), name);
	}

	// The list filters by short code, so a mission without one cannot be offered.
	const missions = db
		.prepare(
			`SELECT DISTINCT m.short_code AS shortCode, m.title
			FROM replay_games g
			JOIN missions m ON m.id = g.mission_id
			WHERE g.published_at IS NOT NULL AND g.episode_number IS NOT NULL AND TRIM(COALESCE(m.short_code, '')) != ''`
		)
		.all() as { shortCode: string; title: string }[];

	return { terrains: [...terrains.values()], missions };
}

export function findPublishedGame(id: number): PublicReplayListItem | null {
	const row = getDb().prepare(`${PUBLISHED_SELECT} AND g.id = ?`).get(id) as PublishedRow | undefined;
	return row ? toPublished(row) : null;
}

export function findEpisodeReplays(episodes: { missionId: number; episodeNumber: number }[]): EpisodeReplay[] {
	if (episodes.length === 0) return [];
	const rows = getDb()
		.prepare(
			`SELECT g.mission_id, g.episode_number, MAX(g.id) AS game_id
			FROM replay_games g
			JOIN (SELECT DISTINCT json_extract(e.value, '$[0]') AS mission_id, json_extract(e.value, '$[1]') AS episode_number
				FROM json_each(?) e) wanted
				ON wanted.mission_id = g.mission_id AND wanted.episode_number = g.episode_number
			WHERE g.published_at IS NOT NULL
			GROUP BY g.mission_id, g.episode_number`
		)
		.all(JSON.stringify(episodes.map((episode) => [episode.missionId, episode.episodeNumber]))) as {
		mission_id: number;
		episode_number: number;
		game_id: number;
	}[];
	return rows.map((row) => ({ missionId: row.mission_id, episodeNumber: row.episode_number, gameId: row.game_id }));
}

export function listMissionReplays(missionShortCode: string): PublicReplayListItem[] {
	const rows = getDb()
		.prepare(`${PUBLISHED_SELECT} AND LOWER(m.short_code) = LOWER(?) ORDER BY g.episode_number ASC, g.id ASC`)
		.all(missionShortCode) as PublishedRow[];
	return rows.map(toPublished);
}

export function replaceGamePlayers(gameId: number, players: ReplayPlayer[]): void {
	const db = getDb();
	const clear = db.prepare(`DELETE FROM replay_game_players WHERE game_id = ?`);
	const insert = db.prepare(`INSERT INTO replay_game_players (game_id, player_ref, identity_guid, name) VALUES (?, ?, ?, ?)`);
	db.transaction(() => {
		clear.run(gameId);
		for (const player of players) insert.run(gameId, player.ref, player.identityGuid, player.name);
	})();
}

export function findMap(world: string): ReplayMap | null {
	const row = getDb().prepare(`SELECT world, relief_sha256, topo_sha256 FROM replay_maps WHERE world = ?`).get(world) as
		| { world: string; relief_sha256: string | null; topo_sha256: string | null }
		| undefined;
	return row ? { world: row.world, reliefSha256: row.relief_sha256, topoSha256: row.topo_sha256 } : null;
}

export function listCompleteMaps(): ReplayMap[] {
	const rows = getDb()
		.prepare(`SELECT world, relief_sha256, topo_sha256 FROM replay_maps WHERE relief_sha256 IS NOT NULL AND topo_sha256 IS NOT NULL`)
		.all() as { world: string; relief_sha256: string; topo_sha256: string }[];
	return rows.map((row) => ({ world: row.world, reliefSha256: row.relief_sha256, topoSha256: row.topo_sha256 }));
}

export function isPublishedSegment(sha256: string): boolean {
	const row = getDb()
		.prepare(
			`SELECT 1 FROM replay_games g, json_each(g.segments_json) j
			WHERE g.published_at IS NOT NULL AND j.value = ? LIMIT 1`
		)
		.get(sha256);
	return row !== undefined;
}

export function findMapFileKind(sha256: string): 'relief' | 'topo' | null {
	const row = getDb()
		.prepare(
			`SELECT CASE WHEN relief_sha256 = ? THEN 'relief' ELSE 'topo' END AS kind
			FROM replay_maps WHERE relief_sha256 = ? OR topo_sha256 = ? LIMIT 1`
		)
		.get(sha256, sha256, sha256) as { kind: 'relief' | 'topo' } | undefined;
	return row?.kind ?? null;
}

export function saveMap(map: ReplayMap, updatedBySteamid64: string): void {
	getDb()
		.prepare(
			`INSERT INTO replay_maps (world, relief_sha256, topo_sha256, updated_by_steamid64)
			VALUES (?, ?, ?, ?)
			ON CONFLICT(world) DO UPDATE SET
				relief_sha256 = excluded.relief_sha256,
				topo_sha256 = excluded.topo_sha256,
				updated_at = CURRENT_TIMESTAMP,
				updated_by_steamid64 = excluded.updated_by_steamid64`
		)
		.run(map.world, map.reliefSha256, map.topoSha256, updatedBySteamid64);
}

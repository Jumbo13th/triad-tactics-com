import { getDb } from '@/platform/db/connection';
import type { ReplayFileKind, ReplayGameEnding } from '../domain/protocol';
import type { SegmentHeader } from '../domain/segmentHeader';
import type {
	PublicReplayListItem,
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

const FILE_COLUMNS = `sha256, kind, server_id, session, name, size, encoded_size, encoded_sha256, storage_key, header_json`;

// The first segment's header names the mission, world and start time of the game.
const FIRST_HEADER = `(SELECT f.header_json FROM replay_files f
	WHERE f.sha256 = json_extract(g.segments_json, '$[0]'))`;

const GAME_LIST_SELECT = `
	SELECT
		g.id, g.server_id, g.session, g.over, g.identity_sha256, g.stats_sha256,
		g.post_count, g.first_posted_at, g.last_posted_at,
		g.mission_id, m.title AS mission_title, g.episode_number, g.published_at,
		(SELECT COUNT(*) FROM json_each(g.segments_json)) AS segment_count,
		(SELECT COALESCE(SUM(f.size), 0) FROM json_each(g.segments_json) j
			JOIN replay_files f ON f.sha256 = j.value) AS size,
		(SELECT COALESCE(SUM(f.encoded_size), 0) FROM json_each(g.segments_json) j
			JOIN replay_files f ON f.sha256 = j.value) AS encoded_size,
		${FIRST_HEADER} AS first_header_json
	FROM replay_games g
	LEFT JOIN missions m ON m.id = g.mission_id`;

// Statistics are linked by mission episode and shown only once published.
const PUBLISHED_SELECT = `
	SELECT
		g.id, m.title AS mission_title, m.short_code AS mission_short_code,
		g.episode_number, g.published_at,
		${FIRST_HEADER} AS first_header_json,
		(SELECT s.id FROM game_stats s
			WHERE s.mission_id = g.mission_id AND s.episode_number = g.episode_number
				AND s.status = 'published') AS stats_id
	FROM replay_games g
	JOIN missions m ON m.id = g.mission_id
	WHERE g.published_at IS NOT NULL AND g.episode_number IS NOT NULL`;

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
		mission: header?.mission ?? null,
		world: header?.world ?? null,
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
	};
}

function toPublished(row: PublishedRow): PublicReplayListItem {
	const header = parseHeader(row.first_header_json);
	return {
		id: row.id,
		missionTitle: row.mission_title,
		missionShortCode: row.mission_short_code,
		episodeNumber: row.episode_number,
		world: header?.world ?? null,
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

export function saveGame(game: ReplayGameInput): { created: boolean } {
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
			RETURNING post_count`
		)
		.get(game.serverId, game.session, game.over, JSON.stringify(game.segments), game.identity, game.stats) as {
		post_count: number;
	};
	return { created: row.post_count === 1 };
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

export function findGame(id: number): ReplayGameRecord | null {
	const row = getDb()
		.prepare(
			`SELECT id, server_id, session, over, segments_json, identity_sha256, stats_sha256,
				mission_id, episode_number, published_at, announced_at
			FROM replay_games WHERE id = ?`
		)
		.get(id) as GameRow | undefined;
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

export function listPublishedGames(input: { limit: number; offset: number }): PublicReplayListItem[] {
	const rows = getDb()
		.prepare(`${PUBLISHED_SELECT} ORDER BY g.published_at DESC, g.id DESC LIMIT ? OFFSET ?`)
		.all(input.limit, input.offset) as PublishedRow[];
	return rows.map(toPublished);
}

export function findPublishedGame(id: number): PublicReplayListItem | null {
	const row = getDb().prepare(`${PUBLISHED_SELECT} AND g.id = ?`).get(id) as PublishedRow | undefined;
	return row ? toPublished(row) : null;
}

export function findMap(world: string): ReplayMap | null {
	const row = getDb().prepare(`SELECT world, relief_sha256, topo_sha256 FROM replay_maps WHERE world = ?`).get(world) as
		| { world: string; relief_sha256: string | null; topo_sha256: string | null }
		| undefined;
	return row ? { world: row.world, reliefSha256: row.relief_sha256, topoSha256: row.topo_sha256 } : null;
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

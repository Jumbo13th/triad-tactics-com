import { getDb } from '@/platform/db/connection';
import type { ReplayFileKind, ReplayGameEnding } from '../domain/protocol';
import type { SegmentHeader } from '../domain/segmentHeader';
import type { ReplayFile, ReplayGameInput, ReplayGameListItem } from '../domain/types';

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
};

const FILE_COLUMNS = `sha256, kind, server_id, session, name, size, encoded_size, encoded_sha256, storage_key, header_json`;

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
		.prepare(
			`SELECT
				g.id, g.server_id, g.session, g.over, g.identity_sha256, g.stats_sha256,
				g.post_count, g.first_posted_at, g.last_posted_at,
				(SELECT COUNT(*) FROM json_each(g.segments_json)) AS segment_count,
				(SELECT COALESCE(SUM(f.size), 0) FROM json_each(g.segments_json) j
					JOIN replay_files f ON f.sha256 = j.value) AS size,
				(SELECT COALESCE(SUM(f.encoded_size), 0) FROM json_each(g.segments_json) j
					JOIN replay_files f ON f.sha256 = j.value) AS encoded_size,
				(SELECT f.header_json FROM replay_files f
					WHERE f.sha256 = json_extract(g.segments_json, '$[0]')) AS first_header_json
			FROM replay_games g
			ORDER BY g.id DESC
			LIMIT ? OFFSET ?`
		)
		.all(input.limit, input.offset) as GameListRow[];

	return rows.map((row) => {
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
		};
	});
}

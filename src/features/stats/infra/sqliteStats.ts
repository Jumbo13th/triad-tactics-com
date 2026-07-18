import { getDb } from '@/platform/db/connection';
import { parseSnapshot, type StatsSnapshot } from '../domain/snapshot';
import type { GameStatsMeta, Season, StatsMapping, UnitScore, UnitScoreWithUnit } from '../domain/types';
import type { MatchedPlayer, MissionOption, StandingsAggregate, UnitHistoryEntry, UnitRef } from '../ports';

type SeasonRow = {
	id: number;
	name: string;
	status: 'active' | 'closed';
	starts_at: string;
	ends_at: string | null;
};

type GameStatsRow = {
	id: number;
	mission_id: number;
	episode_number: number;
	season_id: number | null;
	status: 'draft' | 'published';
	winner_side: string;
	mission_name: string;
	played_at: string;
	snapshot_hash: string;
	created_at: string;
	published_at: string | null;
};

const META_COLUMNS = `id, mission_id, episode_number, season_id, status, winner_side, mission_name, played_at, snapshot_hash, created_at, published_at`;

function toSeason(row: SeasonRow): Season {
	return { id: row.id, name: row.name, status: row.status, startsAt: row.starts_at, endsAt: row.ends_at };
}

function toMeta(row: GameStatsRow): GameStatsMeta {
	return {
		id: row.id,
		missionId: row.mission_id,
		episodeNumber: row.episode_number,
		seasonId: row.season_id,
		status: row.status,
		winnerSide: row.winner_side,
		missionName: row.mission_name,
		playedAt: row.played_at,
		snapshotHash: row.snapshot_hash,
		createdAt: row.created_at,
		publishedAt: row.published_at,
	};
}

export function createSeason(input: { name: string; createdBySteamid64: string }): Season | 'active_season_exists' {
	const db = getDb();

	const active = db.prepare(`SELECT ${seasonColumns()} FROM seasons WHERE status = 'active' LIMIT 1`).get() as SeasonRow | undefined;
	if (active) return 'active_season_exists';

	const result = db
		.prepare(`INSERT INTO seasons (name, status, created_by_steamid64) VALUES (?, 'active', ?)`)
		.run(input.name, input.createdBySteamid64);

	const row = db.prepare(`SELECT ${seasonColumns()} FROM seasons WHERE id = ?`).get(Number(result.lastInsertRowid)) as SeasonRow;
	return toSeason(row);
}

export function closeSeason(seasonId: number): boolean {
	const db = getDb();
	const result = db
		.prepare(`UPDATE seasons SET status = 'closed', ends_at = datetime('now') WHERE id = ? AND status = 'active'`)
		.run(seasonId);
	return result.changes > 0;
}

export function getActiveSeason(): Season | null {
	const db = getDb();
	const row = db.prepare(`SELECT ${seasonColumns()} FROM seasons WHERE status = 'active' LIMIT 1`).get() as SeasonRow | undefined;
	return row ? toSeason(row) : null;
}

export function getSeason(seasonId: number): Season | null {
	const db = getDb();
	const row = db.prepare(`SELECT ${seasonColumns()} FROM seasons WHERE id = ?`).get(seasonId) as SeasonRow | undefined;
	return row ? toSeason(row) : null;
}

export function listSeasons(): Season[] {
	const db = getDb();
	const rows = db.prepare(`SELECT ${seasonColumns()} FROM seasons ORDER BY id DESC`).all() as SeasonRow[];
	return rows.map(toSeason);
}

function seasonColumns(): string {
	return `id, name, status, starts_at, ends_at`;
}

export function missionTitle(missionId: number): string | null {
	const db = getDb();
	const row = db.prepare(`SELECT title FROM missions WHERE id = ?`).get(missionId) as { title: string } | undefined;
	return row ? row.title : null;
}

export function findByHash(hash: string): GameStatsMeta | null {
	const db = getDb();
	const row = db.prepare(`SELECT ${META_COLUMNS} FROM game_stats WHERE snapshot_hash = ?`).get(hash) as GameStatsRow | undefined;
	return row ? toMeta(row) : null;
}

export function findByMissionEpisode(missionId: number, episodeNumber: number): GameStatsMeta | null {
	const db = getDb();
	const row = db
		.prepare(`SELECT ${META_COLUMNS} FROM game_stats WHERE mission_id = ? AND episode_number = ?`)
		.get(missionId, episodeNumber) as GameStatsRow | undefined;
	return row ? toMeta(row) : null;
}

export function insertDraft(input: {
	missionId: number;
	episodeNumber: number;
	snapshotJson: string;
	snapshotHash: string;
	configJson: string;
	mappingJson: string;
	winnerSide: string;
	missionName: string;
	playedAt: string;
	uploadedBySteamid64: string;
}): number {
	const db = getDb();
	const result = db
		.prepare(
			`INSERT INTO game_stats (mission_id, episode_number, status, snapshot_json, snapshot_hash, config_json, mapping_json, winner_side, mission_name, played_at, uploaded_by_steamid64)
			 VALUES (?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?)`
		)
		.run(
			input.missionId,
			input.episodeNumber,
			input.snapshotJson,
			input.snapshotHash,
			input.configJson,
			input.mappingJson,
			input.winnerSide,
			input.missionName,
			input.playedAt,
			input.uploadedBySteamid64
		);
	return Number(result.lastInsertRowid);
}

export function replaceDraft(gameStatsId: number, input: {
	snapshotJson: string;
	snapshotHash: string;
	configJson: string;
	mappingJson: string;
	winnerSide: string;
	missionName: string;
	playedAt: string;
	uploadedBySteamid64: string;
}): void {
	const db = getDb();
	db.prepare(
		`UPDATE game_stats
		 SET snapshot_json = ?, snapshot_hash = ?, config_json = ?, mapping_json = ?, winner_side = ?,
		     mission_name = ?, played_at = ?, uploaded_by_steamid64 = ?, updated_at = datetime('now')
		 WHERE id = ? AND status = 'draft'`
	).run(
		input.snapshotJson,
		input.snapshotHash,
		input.configJson,
		input.mappingJson,
		input.winnerSide,
		input.missionName,
		input.playedAt,
		input.uploadedBySteamid64,
		gameStatsId
	);
}

export function getMeta(gameStatsId: number): GameStatsMeta | null {
	const db = getDb();
	const row = db.prepare(`SELECT ${META_COLUMNS} FROM game_stats WHERE id = ?`).get(gameStatsId) as GameStatsRow | undefined;
	return row ? toMeta(row) : null;
}

export function getSnapshot(gameStatsId: number): StatsSnapshot | null {
	const db = getDb();
	const row = db.prepare(`SELECT snapshot_json FROM game_stats WHERE id = ?`).get(gameStatsId) as { snapshot_json: string } | undefined;
	if (!row) return null;

	const parsed = parseSnapshot(row.snapshot_json);
	return parsed.success ? parsed.snapshot : null;
}

export function getMapping(gameStatsId: number): StatsMapping {
	const db = getDb();
	const row = db.prepare(`SELECT mapping_json, winner_side FROM game_stats WHERE id = ?`).get(gameStatsId) as
		| { mapping_json: string; winner_side: string }
		| undefined;

	const empty: StatsMapping = { guidUnit: {}, winner: '', commanders: [] };
	if (!row) return empty;

	try {
		const parsed = JSON.parse(row.mapping_json) as Partial<StatsMapping>;
		return {
			guidUnit: parsed.guidUnit ?? {},
			winner: parsed.winner ?? row.winner_side,
			commanders: parsed.commanders ?? [],
		};
	} catch {
		return { ...empty, winner: row.winner_side };
	}
}

export function updateMapping(gameStatsId: number, mapping: StatsMapping): void {
	const db = getDb();
	db.prepare(`UPDATE game_stats SET mapping_json = ?, winner_side = ?, updated_at = datetime('now') WHERE id = ?`).run(
		JSON.stringify(mapping),
		mapping.winner,
		gameStatsId
	);
}

export function publish(gameStatsId: number, input: {
	seasonId: number | null;
	winnerSide: string;
	rows: UnitScore[];
	publishedBySteamid64: string;
}): void {
	const db = getDb();

	const run = db.transaction(() => {
		db.prepare(`DELETE FROM game_stats_unit_scores WHERE game_stats_id = ?`).run(gameStatsId);

		const insert = db.prepare(
			`INSERT INTO game_stats_unit_scores (game_stats_id, unit_id, side, kills, zone_kills, ai_kills, teamkills, deaths, survivors, participants, occupancy_pct, objective_points, base_points, multiplier, final_points, is_commander, is_winner_side)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
		);

		for (const row of input.rows) {
			insert.run(
				gameStatsId,
				row.unitId,
				row.side,
				row.kills,
				row.zoneKills,
				row.aiKills,
				row.teamkills,
				row.deaths,
				row.survivors,
				row.participants,
				row.occupancyPct,
				row.objectivePoints,
				row.basePoints,
				row.multiplier,
				row.finalPoints,
				row.isCommander ? 1 : 0,
				row.isWinnerSide ? 1 : 0
			);
		}

		db.prepare(
			`UPDATE game_stats
			 SET status = 'published', season_id = ?, winner_side = ?, published_at = datetime('now'), published_by_steamid64 = ?, updated_at = datetime('now')
			 WHERE id = ?`
		).run(input.seasonId, input.winnerSide, input.publishedBySteamid64, gameStatsId);
	});

	run();
}

export function unpublish(gameStatsId: number): void {
	const db = getDb();
	const run = db.transaction(() => {
		db.prepare(`DELETE FROM game_stats_unit_scores WHERE game_stats_id = ?`).run(gameStatsId);
		db.prepare(`UPDATE game_stats SET status = 'draft', published_at = NULL, updated_at = datetime('now') WHERE id = ?`).run(gameStatsId);
	});
	run();
}

export function deleteDraft(gameStatsId: number): boolean {
	const db = getDb();
	// Status guard in the WHERE: a concurrent publish can't race the delete.
	const result = db.prepare(`DELETE FROM game_stats WHERE id = ? AND status = 'draft'`).run(gameStatsId);
	return result.changes > 0;
}

export function listGames(input: { seasonId?: number | null; publishedOnly: boolean; limit: number; offset?: number }): GameStatsMeta[] {
	const db = getDb();

	const clauses: string[] = [];
	const params: unknown[] = [];

	if (input.publishedOnly) clauses.push(`status = 'published'`);
	if (input.seasonId !== undefined && input.seasonId !== null) {
		clauses.push(`season_id = ?`);
		params.push(input.seasonId);
	}

	const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
	const rows = db
		.prepare(`SELECT ${META_COLUMNS} FROM game_stats ${where} ORDER BY id DESC LIMIT ? OFFSET ?`)
		.all(...params, input.limit, input.offset ?? 0) as GameStatsRow[];

	return rows.map(toMeta);
}

export function listGamesForMission(missionId: number): GameStatsMeta[] {
	const db = getDb();
	const rows = db
		.prepare(`SELECT ${META_COLUMNS} FROM game_stats WHERE mission_id = ? ORDER BY episode_number ASC`)
		.all(missionId) as GameStatsRow[];
	return rows.map(toMeta);
}

export function findMissionIdByShortCode(shortCode: string): number | null {
	const db = getDb();
	const row = db.prepare(`SELECT id FROM missions WHERE short_code = ?`).get(shortCode) as { id: number } | undefined;
	return row ? row.id : null;
}

export function listMissionOptions(): MissionOption[] {
	const db = getDb();
	const rows = db
		.prepare(`SELECT id, title, short_code, status, starts_at FROM missions ORDER BY id DESC`)
		.all() as { id: number; title: string; short_code: string; status: string; starts_at: string | null }[];
	return rows.map((row) => ({
		id: row.id,
		title: row.title,
		shortCode: row.short_code,
		status: row.status,
		startsAt: row.starts_at ?? '',
	}));
}

type ScoreRow = {
	unit_id: number;
	side: string;
	kills: number;
	zone_kills: number;
	ai_kills: number;
	teamkills: number;
	deaths: number;
	survivors: number;
	participants: number;
	occupancy_pct: number | null;
	objective_points: number;
	base_points: number;
	multiplier: number;
	final_points: number;
	is_commander: number;
	is_winner_side: number;
	unit_tag?: string;
	unit_name?: string;
};

function toScore(row: ScoreRow): UnitScore {
	return {
		unitId: row.unit_id,
		side: row.side,
		kills: row.kills,
		zoneKills: row.zone_kills,
		aiKills: row.ai_kills,
		teamkills: row.teamkills,
		deaths: row.deaths,
		survivors: row.survivors,
		participants: row.participants,
		occupancyPct: row.occupancy_pct,
		objectivePoints: row.objective_points,
		basePoints: row.base_points,
		multiplier: row.multiplier,
		finalPoints: row.final_points,
		isCommander: row.is_commander === 1,
		isWinnerSide: row.is_winner_side === 1,
	};
}

export function getScores(gameStatsId: number): UnitScoreWithUnit[] {
	const db = getDb();
	const rows = db
		.prepare(
			`SELECT s.*, u.tag AS unit_tag, u.name AS unit_name
			 FROM game_stats_unit_scores s
			 JOIN units u ON u.id = s.unit_id
			 WHERE s.game_stats_id = ?
			 ORDER BY s.side ASC, s.final_points DESC`
		)
		.all(gameStatsId) as ScoreRow[];

	return rows.map((row) => ({ ...toScore(row), unitTag: row.unit_tag ?? '', unitName: row.unit_name ?? '' }));
}

export function getUnitHistory(unitId: number): UnitHistoryEntry[] {
	const db = getDb();
	const rows = db
		.prepare(
			`SELECT s.*, g.id AS g_id, g.mission_id, g.episode_number, g.season_id, g.status, g.winner_side, g.mission_name, g.played_at, g.snapshot_hash, g.created_at, g.published_at
			 FROM game_stats_unit_scores s
			 JOIN game_stats g ON g.id = s.game_stats_id AND g.status = 'published'
			 WHERE s.unit_id = ?
			 ORDER BY g.id DESC`
		)
		.all(unitId) as (ScoreRow & GameStatsRow & { g_id: number })[];

	return rows.map((row) => ({
		game: toMeta({ ...row, id: row.g_id }),
		score: toScore(row),
	}));
}

export function getStandingsAggregates(seasonId: number | null): StandingsAggregate[] {
	const db = getDb();

	const seasonClause = seasonId === null ? '' : 'AND g.season_id = ?';
	const params: unknown[] = seasonId === null ? [] : [seasonId];

	const rows = db
		.prepare(
			`SELECT s.unit_id, u.tag AS unit_tag, u.name AS unit_name,
			        SUM(s.final_points) AS raw_points,
			        COUNT(*) AS games,
			        SUM(s.is_winner_side) AS wins,
			        SUM(CASE WHEN s.is_commander = 1 AND s.is_winner_side = 1 THEN 1 ELSE 0 END) AS command_wins,
			        SUM(s.kills) AS kills,
			        SUM(s.deaths) AS deaths,
			        SUM(s.teamkills) AS teamkills,
			        SUM(s.participants) AS total_participants
			 FROM game_stats_unit_scores s
			 JOIN game_stats g ON g.id = s.game_stats_id AND g.status = 'published' ${seasonClause}
			 JOIN units u ON u.id = s.unit_id
			 GROUP BY s.unit_id, u.tag, u.name`
		)
		.all(...params) as {
		unit_id: number;
		unit_tag: string;
		unit_name: string;
		raw_points: number;
		games: number;
		wins: number;
		command_wins: number;
		kills: number;
		deaths: number;
		teamkills: number;
		total_participants: number;
	}[];

	return rows.map((row) => ({
		unitId: row.unit_id,
		unitTag: row.unit_tag,
		unitName: row.unit_name,
		rawPoints: row.raw_points,
		games: row.games,
		wins: row.wins,
		commandWins: row.command_wins,
		kills: row.kills,
		deaths: row.deaths,
		teamkills: row.teamkills,
		totalParticipants: row.total_participants,
	}));
}

export function findPlayersByGuids(guids: string[]): Record<string, MatchedPlayer> {
	const db = getDb();
	const result: Record<string, MatchedPlayer> = {};
	if (guids.length === 0) return result;

	const stmt = db.prepare(
		`SELECT u.arma_guid AS guid, u.id AS user_id, u.current_callsign AS callsign,
		        un.id AS unit_id, un.tag AS unit_tag, un.name AS unit_name
		 FROM users u
		 LEFT JOIN unit_memberships um ON um.user_id = u.id AND um.role IN ('member', 'deputy', 'leader')
		 LEFT JOIN units un ON un.id = um.unit_id
		 WHERE LOWER(u.arma_guid) = LOWER(?)
		 LIMIT 1`
	);

	for (const guid of guids) {
		const row = stmt.get(guid) as
			| { guid: string; user_id: number; callsign: string; unit_id: number | null; unit_tag: string | null; unit_name: string | null }
			| undefined;
		if (!row) continue;
		result[guid] = {
			userId: row.user_id,
			callsign: row.callsign,
			unitId: row.unit_id,
			unitTag: row.unit_tag,
			unitName: row.unit_name,
		};
	}

	return result;
}

export function findUnitsByTags(tags: string[]): Record<string, UnitRef> {
	const db = getDb();
	const result: Record<string, UnitRef> = {};
	if (tags.length === 0) return result;

	const stmt = db.prepare(`SELECT id, tag, name FROM units WHERE LOWER(tag) = LOWER(?) LIMIT 1`);
	for (const tag of tags) {
		const row = stmt.get(tag) as { id: number; tag: string; name: string } | undefined;
		if (row) result[tag.toLowerCase()] = { unitId: row.id, tag: row.tag, name: row.name };
	}
	return result;
}

export function listAllUnits(): UnitRef[] {
	const db = getDb();
	const rows = db.prepare(`SELECT id, tag, name FROM units ORDER BY LOWER(tag) ASC`).all() as { id: number; tag: string; name: string }[];
	return rows.map((row) => ({ unitId: row.id, tag: row.tag, name: row.name }));
}

export function getUnitsByIds(unitIds: number[]): Record<number, UnitRef> {
	const db = getDb();
	const result: Record<number, UnitRef> = {};
	if (unitIds.length === 0) return result;

	const stmt = db.prepare(`SELECT id, tag, name FROM units WHERE id = ?`);
	for (const unitId of unitIds) {
		const row = stmt.get(unitId) as { id: number; tag: string; name: string } | undefined;
		if (row) result[unitId] = { unitId: row.id, tag: row.tag, name: row.name };
	}
	return result;
}

export function dataFingerprint(): string {
	const db = getDb();
	const row = db
		.prepare(
			`SELECT
				(SELECT COUNT(*) FROM game_stats WHERE status = 'published') AS published,
				(SELECT COALESCE(MAX(updated_at), '') FROM game_stats) AS updated,
				(SELECT COALESCE(MAX(id), 0) FROM seasons) AS seasonMax,
				(SELECT COALESCE(MAX(id), 0) FROM seasons WHERE status = 'active') AS activeSeason`
		)
		.get() as { published: number; updated: string; seasonMax: number; activeSeason: number };
	return `${row.published}|${row.updated}|${row.seasonMax}|${row.activeSeason}`;
}

/** Occupancy denominator: slots each unit's members claimed in the episode slotting. */
export function getClaimedSlotsByUnit(missionId: number, episodeNumber: number): Record<number, number> {
	const db = getDb();

	const episodeRow = db
		.prepare(`SELECT slotting_json FROM mission_episode_slotting WHERE mission_id = ? AND episode_number = ?`)
		.get(missionId, episodeNumber) as { slotting_json: string } | undefined;

	const missionRow = episodeRow
		? undefined
		: (db.prepare(`SELECT slotting_json FROM missions WHERE id = ?`).get(missionId) as { slotting_json: string } | undefined);

	const slottingJson = episodeRow?.slotting_json ?? missionRow?.slotting_json;
	if (!slottingJson) return {};

	let slotting: unknown;
	try {
		slotting = JSON.parse(slottingJson);
	} catch {
		return {};
	}

	const byUser = new Map<number, number>();
	const sides = (slotting as { sides?: unknown[] }).sides ?? [];
	for (const side of sides) {
		const squads = (side as { squads?: unknown[] }).squads ?? [];
		for (const squad of squads) {
			const slots = (squad as { slots?: unknown[] }).slots ?? [];
			for (const slot of slots) {
				const occupant = (slot as { occupant?: { type?: string; userId?: number } }).occupant;
				if (occupant?.type === 'user' && typeof occupant.userId === 'number') {
					byUser.set(occupant.userId, (byUser.get(occupant.userId) ?? 0) + 1);
				}
			}
		}
	}

	const result: Record<number, number> = {};
	if (byUser.size === 0) return result;

	const stmt = db.prepare(
		`SELECT um.unit_id AS unit_id FROM unit_memberships um WHERE um.user_id = ? AND um.role IN ('member', 'deputy', 'leader') LIMIT 1`
	);

	for (const [userId, count] of byUser) {
		const row = stmt.get(userId) as { unit_id: number } | undefined;
		if (!row) continue;
		result[row.unit_id] = (result[row.unit_id] ?? 0) + count;
	}

	return result;
}

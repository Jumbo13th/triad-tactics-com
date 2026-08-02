import { computeUnitScores, extractTimeline } from '../domain/compute';
import type { StatsSnapshot } from '../domain/snapshot';
import type { GameStatsMeta, GameTimelineEvent, PlayerMappingPreview, Season, StatsMapping, UnitScoreWithUnit } from '../domain/types';
import type { StatsDeps, UnitRef } from '../ports';

/** Everything the admin mapping/preview screen needs; the preview reflects the SAVED mapping. */
export type GameStatsAdminView = {
	meta: GameStatsMeta;
	mapping: StatsMapping;
	players: PlayerMappingPreview[];
	preview: UnitScoreWithUnit[];
	timeline: GameTimelineEvent[];
	factions: string[];
	snapshotWinner: string;
	snapshotCommanders: { faction: string; unitTag: string }[];
	activeSeason: Season | null;
	allUnits: UnitRef[];
	unmatchedGuids: number;
};

export function buildGameStatsAdminView(deps: StatsDeps, gameStatsId: number): GameStatsAdminView | null {
	const meta = deps.repo.getMeta(gameStatsId);
	if (!meta) return null;

	const snapshot = deps.repo.getSnapshot(gameStatsId);
	if (!snapshot) return null;

	const mapping = deps.repo.getMapping(gameStatsId);
	const players = buildPlayerPreviews(deps, snapshot, mapping);

	const allocatedSlotsByUnit = deps.repo.getAllocatedSlotsByUnit(meta.missionId, meta.episodeNumber);
	const rows = computeUnitScores({ snapshot, config: snapshot.config, mapping, allocatedSlotsByUnit });

	const units = deps.repo.getUnitsByIds(rows.map((row) => row.unitId));
	const preview: UnitScoreWithUnit[] = rows.map((row) => ({
		...row,
		unitTag: units[row.unitId]?.tag ?? `#${row.unitId}`,
		unitName: units[row.unitId]?.name ?? '',
	}));

	let unmatchedGuids = 0;
	for (const player of players) {
		if (player.resolvedUnitId === null && player.matchedUnitId === null) unmatchedGuids++;
	}

	return {
		meta,
		mapping,
		players,
		preview,
		timeline: extractTimeline(snapshot),
		factions: snapshot.factions,
		snapshotWinner: snapshot.winner,
		snapshotCommanders: snapshot.commanders,
		activeSeason: deps.repo.getActiveSeason(),
		allUnits: deps.repo.listAllUnits(),
		unmatchedGuids,
	};
}

function buildPlayerPreviews(deps: StatsDeps, snapshot: StatsSnapshot, mapping: StatsMapping): PlayerMappingPreview[] {
	const guids = snapshot.players.map((p) => p.guid);
	const matched = deps.repo.findPlayersByGuids(guids);

	return snapshot.players.map((player) => {
		const match = matched[player.guid];
		const resolved = mapping.guidUnit[player.guid];

		return {
			guid: player.guid,
			name: player.name,
			callsign: player.callsign,
			snapshotUnitTag: player.unitTag,
			faction: player.faction,
			participated: player.participated,
			matchedUserId: match?.userId ?? null,
			matchedCallsign: match?.callsign ?? null,
			matchedUnitId: match?.unitId ?? null,
			matchedUnitTag: match?.unitTag ?? null,
			matchedUnitName: match?.unitName ?? null,
			resolvedUnitId: resolved === undefined ? null : resolved,
		};
	});
}

/** Upload-time automap: registered GUID → unit; unresolvable players map to null. */
export function buildAutoMapping(deps: StatsDeps, snapshot: StatsSnapshot): StatsMapping {
	const guids = snapshot.players.map((p) => p.guid);
	const matched = deps.repo.findPlayersByGuids(guids);

	const guidUnit: Record<string, number | null> = {};
	for (const player of snapshot.players) {
		guidUnit[player.guid] = matched[player.guid]?.unitId ?? null;
	}

	// The GM's in-game commander picks arrive as unit TAGS — resolve to ids.
	const tagRefs = deps.repo.findUnitsByTags(snapshot.commanders.map((c) => c.unitTag));
	const commanders: { faction: string; unitId: number }[] = [];
	for (const commander of snapshot.commanders) {
		const ref = tagRefs[commander.unitTag.toLowerCase()];
		if (ref && commander.faction) commanders.push({ faction: commander.faction, unitId: ref.unitId });
	}

	return { guidUnit, winner: snapshot.winner, commanders };
}

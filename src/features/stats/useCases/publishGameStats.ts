import { computeUnitScores } from '../domain/compute';
import type { StatsDeps } from '../ports';
import type { StatsMapping } from '../domain/types';

export type PublishGameStatsResult =
	| { success: true; seasonId: number | null; rowCount: number }
	| { success: false; error: 'not_found' | 'no_units_mapped' };

/**
 * Freezes the scores, computed from the snapshot + the FROZEN mapping (never
 * live membership) — later roster changes can't rewrite history. Publishes
 * into the active season, or season-less when none is open.
 */
export function publishGameStats(
	deps: StatsDeps,
	input: { gameStatsId: number; publishedBySteamid64: string }
): PublishGameStatsResult {
	const meta = deps.repo.getMeta(input.gameStatsId);
	const snapshot = deps.repo.getSnapshot(input.gameStatsId);
	if (!meta || !snapshot) return { success: false, error: 'not_found' };

	const mapping: StatsMapping = deps.repo.getMapping(input.gameStatsId);

	const claimedSlotsByUnit = deps.repo.getClaimedSlotsByUnit(meta.missionId, meta.episodeNumber);
	const rows = computeUnitScores({ snapshot, config: snapshot.config, mapping, claimedSlotsByUnit });

	if (rows.length === 0) return { success: false, error: 'no_units_mapped' };

	const season = deps.repo.getActiveSeason();
	const seasonId = season ? season.id : null;

	deps.repo.publish(input.gameStatsId, {
		seasonId,
		winnerSide: mapping.winner,
		rows,
		publishedBySteamid64: input.publishedBySteamid64,
	});

	return { success: true, seasonId, rowCount: rows.length };
}

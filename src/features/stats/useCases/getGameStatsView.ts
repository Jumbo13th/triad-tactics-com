import { extractTimeline } from '../domain/compute';
import type { GameStatsMeta, GameTimelineEvent, UnitScoreWithUnit } from '../domain/types';
import type { StatsDeps } from '../ports';

export type GameStatsView = {
	meta: GameStatsMeta;
	scores: UnitScoreWithUnit[];
	timeline: GameTimelineEvent[];
	factions: string[];
};

/** Public per-game view — PUBLISHED games only, read from the frozen rows. */
export function getGameStatsView(deps: StatsDeps, input: { gameStatsId: number }): GameStatsView | null {
	const meta = deps.repo.getMeta(input.gameStatsId);
	if (!meta || meta.status !== 'published') return null;

	const snapshot = deps.repo.getSnapshot(input.gameStatsId);

	return {
		meta,
		scores: deps.repo.getScores(input.gameStatsId),
		timeline: snapshot ? extractTimeline(snapshot) : [],
		factions: snapshot ? snapshot.factions : [],
	};
}

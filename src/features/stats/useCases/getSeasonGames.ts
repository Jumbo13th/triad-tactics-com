import { statsCached } from '../cache';
import type { GameStatsMeta, UnitScoreWithUnit } from '../domain/types';
import type { StatsDeps } from '../ports';

export type SeasonGame = { meta: GameStatsMeta; scores: UnitScoreWithUnit[] };

/** All published games of a season with their frozen score rows, newest first. */
export function getSeasonGames(deps: StatsDeps, seasonId: number | null): SeasonGame[] {
	return statsCached(`seasonGames|${seasonId}`, deps.repo.dataFingerprint(), () =>
		deps.repo
			.listGames({ seasonId, publishedOnly: true, limit: 1000 })
			.map((meta) => ({ meta, scores: deps.repo.getScores(meta.id) }))
	);
}

import type { StatsDeps } from '../ports';
import { getSeasonRace } from './getSeasonRace';
import { getSeasonStandings } from './getSeasonStandings';

export type UnitSeasonSummary = {
	/** Current place among units with published games, shown as "rank/total". */
	seasonRank: { rank: number; total: number } | null;
	/** Rank after each game, for the season-position chart. */
	rankSeries: { games: string[]; ranks: number[]; totalUnits: number } | null;
};

export function getUnitSeasonSummary(deps: StatsDeps, input: { unitId: number }): UnitSeasonSummary {
	const standings = getSeasonStandings(deps);
	const standingsRow = standings.rows.find((row) => row.unitId === input.unitId);
	const seasonRank = standingsRow ? { rank: standingsRow.rank, total: standings.rows.length } : null;

	const race = getSeasonRace(deps, { seasonId: standings.season ? standings.season.id : null });
	const raceSeries = race.series.find((s) => s.unitId === input.unitId);
	const rankSeries = raceSeries
		? { games: race.games, ranks: raceSeries.ranks, totalUnits: race.series.length }
		: null;

	return { seasonRank, rankSeries };
}

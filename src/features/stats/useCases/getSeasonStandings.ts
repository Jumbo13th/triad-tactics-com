import { statsCached } from '../cache';
import { balancedScore } from '../domain/compute';
import type { Season, StandingsRow } from '../domain/types';
import type { StatsDeps } from '../ports';

export type SeasonStandings = {
	season: Season | null; // null = the requested season does not exist / all-time
	rows: StandingsRow[];
};

/** Season leaderboard ranked by the balanced score (raw ÷ avgParticipants^α). */
export function getSeasonStandings(deps: StatsDeps, input: { seasonId?: number | null } = {}): SeasonStandings {
	let season: Season | null = null;
	let seasonId: number | null = null;

	if (input.seasonId === undefined) {
		season = deps.repo.getActiveSeason() ?? deps.repo.listSeasons()[0] ?? null;
		seasonId = season ? season.id : null;
	} else if (input.seasonId !== null) {
		season = deps.repo.getSeason(input.seasonId);
		seasonId = input.seasonId;
	}

	return { season, rows: statsCached(`standings|${seasonId}`, deps.repo.dataFingerprint(), () => computeRows(deps, seasonId)) };
}

function computeRows(deps: StatsDeps, seasonId: number | null): StandingsRow[] {
	const aggregates = deps.repo.getStandingsAggregates(seasonId);

	const rows: StandingsRow[] = aggregates.map((agg) => {
		const avgParticipants = agg.games > 0 ? agg.totalParticipants / agg.games : 0;
		return {
			rank: 0,
			unitId: agg.unitId,
			unitTag: agg.unitTag,
			unitName: agg.unitName,
			balanced: balancedScore(agg.rawPoints, avgParticipants, deps.balanceAlpha),
			rawPoints: Math.round(agg.rawPoints * 10) / 10,
			perCapita: avgParticipants > 0 ? Math.round((agg.rawPoints / agg.totalParticipants) * 10) / 10 : 0,
			games: agg.games,
			wins: agg.wins,
			commandWins: agg.commandWins,
			kills: agg.kills,
			deaths: agg.deaths,
			teamkills: agg.teamkills,
			avgParticipants: Math.round(avgParticipants * 10) / 10,
		};
	});

	rows.sort((a, b) => b.balanced - a.balanced || b.rawPoints - a.rawPoints);
	rows.forEach((row, index) => {
		row.rank = index + 1;
	});

	return rows;
}

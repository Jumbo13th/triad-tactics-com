import { statsCached } from '../cache';
import { balancedScore } from '../domain/compute';
import type { StatsDeps } from '../ports';
import { getSeasonGames } from './getSeasonGames';

export type SeasonRace = {
	/** Chronological game labels; every label carries its episode suffix. */
	games: string[];
	/** totals = cumulative raw points, ranks = position after each game. */
	series: { unitId: number; unitTag: string; totals: number[]; ranks: number[] }[];
};

/**
 * Season race for the bump/rank charts. Ranks use the SAME balanced score as
 * the standings table — a chart ranked by raw totals would contradict the
 * «Место» shown everywhere else. Totals stay raw so points match the table.
 */
export function getSeasonRace(deps: StatsDeps, input: { seasonId: number | null }): SeasonRace {
	return statsCached(`race|${input.seasonId}`, deps.repo.dataFingerprint(), () => computeRace(deps, input.seasonId));
}

function computeRace(deps: StatsDeps, seasonId: number | null): SeasonRace {
	const games = getSeasonGames(deps, seasonId)
		.slice()
		.sort((a, b) => a.meta.playedAt.localeCompare(b.meta.playedAt) || a.meta.id - b.meta.id);

	const labels: string[] = [];
	const perGame: Map<number, { tag: string; points: number; participants: number }>[] = [];
	const unitIds = new Set<number>();

	for (const game of games) {
		labels.push(`${game.meta.missionName || `#${game.meta.id}`} · E${game.meta.episodeNumber}`);
		const totals = new Map<number, { tag: string; points: number; participants: number }>();
		for (const score of game.scores) {
			const current = totals.get(score.unitId) ?? { tag: score.unitTag, points: 0, participants: 0 };
			current.tag = score.unitTag;
			current.points += score.finalPoints;
			current.participants += score.participants;
			totals.set(score.unitId, current);
			unitIds.add(score.unitId);
		}
		perGame.push(totals);
	}

	const series = [...unitIds].map((unitId) => {
		let tag = '';
		let runningPoints = 0;
		let runningParticipants = 0;
		let gamesPlayed = 0;
		const totals: number[] = [];
		const balanced: number[] = [];
		for (const game of perGame) {
			const entry = game.get(unitId);
			if (entry) {
				tag = entry.tag;
				runningPoints += entry.points;
				runningParticipants += entry.participants;
				gamesPlayed++;
			}
			totals.push(Math.round(runningPoints * 10) / 10);
			const avg = gamesPlayed > 0 ? runningParticipants / gamesPlayed : 0;
			balanced.push(gamesPlayed > 0 ? balancedScore(runningPoints, avg, deps.balanceAlpha) : 0);
		}
		return { unitId, unitTag: tag, totals, balanced, ranks: [] as number[] };
	});

	for (let gameIndex = 0; gameIndex < labels.length; gameIndex++) {
		const order = series
			.slice()
			.sort(
				(a, b) =>
					b.balanced[gameIndex] - a.balanced[gameIndex] ||
					b.totals[gameIndex] - a.totals[gameIndex] ||
					a.unitTag.localeCompare(b.unitTag)
			);
		order.forEach((s, position) => s.ranks.push(position + 1));
	}

	series.sort((a, b) => (a.ranks[a.ranks.length - 1] ?? 999) - (b.ranks[b.ranks.length - 1] ?? 999));

	return { games: labels, series: series.map(({ unitId, unitTag, totals, ranks }) => ({ unitId, unitTag, totals, ranks })) };
}

import type { StatsDeps } from '../ports';
import { getGameStatsView, type GameStatsView } from './getGameStatsView';

// A published game's result in brief, for pages that link to its full statistics (the
// replay viewer). Units stay the entity, as everywhere in statistics: no player lines.

export type GameStatsSummarySide = {
	side: string;
	kills: number;
	zoneKills: number;
	deaths: number;
	teamkills: number;
	participants: number;
	survivors: number;
	points: number;
};

export type GameStatsSummaryUnit = {
	unitTag: string;
	unitName: string;
	side: string;
	points: number;
	kills: number;
	zoneKills: number;
	teamkills: number;
	deaths: number;
	participants: number;
	survivors: number;
	objectivePoints: number;
	winner: boolean;
	commander: boolean;
};

export type GameStatsSummary = {
	id: number;
	/** Faction key, 'draw', or '' when no result was declared. */
	winnerSide: string;
	sides: GameStatsSummarySide[];
	/** The best units by points, best first. */
	units: GameStatsSummaryUnit[];
	unitCount: number;
};

export function summarizeGameStats(view: GameStatsView, topUnits: number): GameStatsSummary {
	const sides = new Map<string, GameStatsSummarySide>();
	// Factions in the snapshot's order first, so sides keep the order the game declared.
	const empty = (side: string) => ({ side, kills: 0, zoneKills: 0, deaths: 0, teamkills: 0, participants: 0, survivors: 0, points: 0 });
	for (const side of view.factions) sides.set(side, empty(side));
	for (const score of view.scores) {
		const side = sides.get(score.side) ?? empty(score.side);
		side.kills += score.kills;
		side.zoneKills += score.zoneKills;
		side.deaths += score.deaths;
		side.teamkills += score.teamkills;
		side.participants += score.participants;
		side.survivors += score.survivors;
		side.points += score.finalPoints;
		sides.set(score.side, side);
	}
	const units = [...view.scores]
		.sort((a, b) => b.finalPoints - a.finalPoints || b.kills - a.kills || a.unitTag.localeCompare(b.unitTag))
		.slice(0, Math.max(0, topUnits))
		.map((score) => ({
			unitTag: score.unitTag,
			unitName: score.unitName,
			side: score.side,
			points: score.finalPoints,
			kills: score.kills,
			zoneKills: score.zoneKills,
			teamkills: score.teamkills,
			deaths: score.deaths,
			participants: score.participants,
			survivors: score.survivors,
			objectivePoints: score.objectivePoints,
			winner: score.isWinnerSide,
			commander: score.isCommander,
		}));
	return {
		id: view.meta.id,
		winnerSide: view.meta.winnerSide,
		sides: [...sides.values()].filter((side) => side.participants > 0 || view.factions.includes(side.side)),
		units,
		unitCount: view.scores.length,
	};
}

/** Published games only, like the full statistics page. */
export function getGameStatsSummary(deps: StatsDeps, input: { gameStatsId: number; topUnits: number }): GameStatsSummary | null {
	const view = getGameStatsView(deps, { gameStatsId: input.gameStatsId });
	return view ? summarizeGameStats(view, input.topUnits) : null;
}

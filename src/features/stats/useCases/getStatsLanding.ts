import type { GameStatsMeta } from '../domain/types';
import type { StatsDeps } from '../ports';
import { getSeasonGames, type SeasonGame } from './getSeasonGames';

/** Structural mirror of rotation's side info — composed in by the app route. */
export type RotationSidesInput = Record<number, { sideName: string; sideColor: string }>;

export type LandingGameSide = { name: string; total: number; participants: number; color: string | null; isWinner: boolean };
export type LandingGame = GameStatsMeta & { sides: LandingGameSide[] };
export type LandingMissionGroup = { missionId: number; missionName: string; episodes: LandingGame[] };

export type StatsLanding = {
	sideWins: { sides: { side: string; wins: number; color: string | null }[]; draws: number };
	missionGroups: LandingMissionGroup[];
	page: number;
	totalPages: number;
};

const MISSIONS_PER_PAGE = 5;

/**
 * The games section of /stats: season side score in ROTATION terms (a game's
 * winning faction maps to a rotation side by majority vote of the winning
 * units' current assignments) plus the mission-grouped episode list, paged by
 * mission. Rotation colors are applied per request so side switches show
 * immediately; the heavy part (games + scores) comes from the stats cache.
 */
export function getStatsLanding(
	deps: StatsDeps,
	input: { seasonId: number | null; rotationSides: RotationSidesInput; page: number }
): StatsLanding {
	const games = getSeasonGames(deps, input.seasonId);

	const winCounts = new Map<string, { wins: number; color: string | null }>();
	for (const info of Object.values(input.rotationSides)) {
		if (!winCounts.has(info.sideName)) winCounts.set(info.sideName, { wins: 0, color: info.sideColor });
	}
	let draws = 0;
	for (const game of games) {
		if (!game.meta.winnerSide) continue;
		if (game.meta.winnerSide === 'draw') {
			draws++;
			continue;
		}
		const winnerName = majoritySide(game, game.meta.winnerSide, input.rotationSides);
		const entry = winCounts.get(winnerName) ?? { wins: 0, color: null };
		entry.wins++;
		winCounts.set(winnerName, entry);
	}
	const sideWins = {
		sides: [...winCounts].map(([side, entry]) => ({ side, wins: entry.wins, color: entry.color })).sort((a, b) => a.side.localeCompare(b.side)),
		draws,
	};

	const allGroups: { missionId: number; missionName: string; games: SeasonGame[] }[] = [];
	for (const game of games) {
		let group = allGroups.find((g) => g.missionId === game.meta.missionId);
		if (!group) {
			group = { missionId: game.meta.missionId, missionName: game.meta.missionName, games: [] };
			allGroups.push(group);
		}
		group.games.push(game);
	}

	const totalPages = Math.max(1, Math.ceil(allGroups.length / MISSIONS_PER_PAGE));
	const page = Math.min(Math.max(1, input.page), totalPages);

	const missionGroups: LandingMissionGroup[] = allGroups
		.slice((page - 1) * MISSIONS_PER_PAGE, page * MISSIONS_PER_PAGE)
		.map((group) => ({
			missionId: group.missionId,
			missionName: group.missionName,
			episodes: group.games
				.slice()
				.sort((a, b) => a.meta.episodeNumber - b.meta.episodeNumber)
				.map((game) => ({ ...game.meta, sides: buildSides(game, input.rotationSides) })),
		}));

	return { sideWins, missionGroups, page, totalPages };
}

function majoritySide(game: SeasonGame, winnerFaction: string, rotationSides: RotationSidesInput): string {
	const tally = new Map<string, number>();
	for (const score of game.scores) {
		if (score.side !== winnerFaction) continue;
		const rotation = rotationSides[score.unitId];
		if (rotation) tally.set(rotation.sideName, (tally.get(rotation.sideName) ?? 0) + 1);
	}
	let winner = winnerFaction;
	let best = 0;
	for (const [name, count] of tally) {
		if (count > best) {
			best = count;
			winner = name;
		}
	}
	return winner;
}

function buildSides(game: SeasonGame, rotationSides: RotationSidesInput): LandingGameSide[] {
	const totals = new Map<string, { total: number; participants: number }>();
	for (const score of game.scores) {
		const entry = totals.get(score.side) ?? { total: 0, participants: 0 };
		entry.total += score.finalPoints;
		entry.participants += score.participants;
		totals.set(score.side, entry);
	}

	return [...totals]
		.map(([name, entry]) => {
			const tally = new Map<string, number>();
			for (const score of game.scores) {
				if (score.side !== name) continue;
				const rotation = rotationSides[score.unitId];
				if (rotation) tally.set(rotation.sideColor, (tally.get(rotation.sideColor) ?? 0) + 1);
			}
			let color: string | null = null;
			let best = 0;
			for (const [candidate, count] of tally) {
				if (count > best) {
					best = count;
					color = candidate;
				}
			}
			return {
				name,
				total: Math.round(entry.total * 10) / 10,
				participants: entry.participants,
				color,
				isWinner: game.meta.winnerSide === name,
			};
		})
		.sort((a, b) => a.name.localeCompare(b.name));
}

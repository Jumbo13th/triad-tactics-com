import { describe, expect, it } from 'vitest';
import type { UnitScoreWithUnit } from '@/features/stats/domain/types';
import { summarizeGameStats } from '@/features/stats/useCases/getGameStatsSummary';
import type { GameStatsView } from '@/features/stats/useCases/getGameStatsView';

function score(overrides: Partial<UnitScoreWithUnit>): UnitScoreWithUnit {
	return {
		unitId: 1,
		unitTag: 'AAA',
		unitName: 'Unit A',
		side: 'US',
		kills: 0,
		zoneKills: 0,
		aiKills: 0,
		teamkills: 0,
		deaths: 0,
		survivors: 0,
		participants: 0,
		occupancyPct: null,
		objectivePoints: 0,
		basePoints: 0,
		multiplier: 1,
		finalPoints: 0,
		isCommander: false,
		isWinnerSide: false,
		...overrides,
	};
}

const view: GameStatsView = {
	meta: {
		id: 7,
		missionId: 3,
		episodeNumber: 1,
		seasonId: null,
		status: 'published',
		winnerSide: 'US',
		missionName: 'Lobby Demo',
		playedAt: '2026-10-31 21:50:00',
		snapshotHash: 'x',
		createdAt: '2026-11-01 00:00:00',
		publishedAt: '2026-11-01 00:10:00',
	},
	factions: ['US', 'USSR'],
	timeline: [],
	scores: [
		score({ unitId: 1, unitTag: 'AAA', side: 'US', kills: 5, zoneKills: 2, deaths: 1, participants: 8, survivors: 7, objectivePoints: 10, finalPoints: 40, isWinnerSide: true }),
		score({ unitId: 2, unitTag: 'BBB', side: 'US', kills: 2, deaths: 3, teamkills: 1, participants: 4, survivors: 1, finalPoints: 55, isWinnerSide: true, isCommander: true }),
		score({ unitId: 3, unitTag: 'CCC', side: 'USSR', kills: 4, deaths: 7, participants: 10, survivors: 3, finalPoints: 12 }),
	],
};

describe('summarizeGameStats', () => {
	it('totals each side in the order the game declared its factions', () => {
		const summary = summarizeGameStats(view, 5);
		expect(summary.winnerSide).toBe('US');
		expect(summary.sides).toEqual([
			{ side: 'US', kills: 7, zoneKills: 2, deaths: 4, teamkills: 1, participants: 12, survivors: 8, points: 95 },
			{ side: 'USSR', kills: 4, zoneKills: 0, deaths: 7, teamkills: 0, participants: 10, survivors: 3, points: 12 },
		]);
	});

	it('lists the best units by points, as many as asked for', () => {
		const summary = summarizeGameStats(view, 2);
		expect(summary.units.map((unit) => unit.unitTag)).toEqual(['BBB', 'AAA']);
		expect(summary.units[0]).toMatchObject({ points: 55, winner: true, commander: true });
		expect(summary.units[1]).toMatchObject({ kills: 5, zoneKills: 2, deaths: 1, participants: 8, survivors: 7, objectivePoints: 10 });
		expect(summary.unitCount).toBe(3);
	});
});

import type { GameStatsMeta } from '../domain/types';
import type { StatsDeps } from '../ports';

export function getPublishedEpisodesForMission(deps: StatsDeps, input: { shortCode: string }): GameStatsMeta[] {
	const missionId = deps.repo.findMissionIdByShortCode(input.shortCode);
	if (!missionId) return [];
	return deps.repo.listGamesForMission(missionId).filter((game) => game.status === 'published');
}

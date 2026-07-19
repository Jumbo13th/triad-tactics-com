import type { Season } from '../domain/types';
import type { StatsDeps } from '../ports';

export type CreateSeasonResult =
	| { success: true; season: Season }
	| { success: false; error: 'active_season_exists' };

export function createSeason(deps: StatsDeps, input: { name: string; createdBySteamid64: string }): CreateSeasonResult {
	const result = deps.repo.createSeason(input);
	if (result === 'active_season_exists') return { success: false, error: 'active_season_exists' };
	return { success: true, season: result };
}

export type CloseSeasonResult = { success: true } | { success: false; error: 'not_active' };

export function closeSeason(deps: StatsDeps, input: { seasonId: number }): CloseSeasonResult {
	if (!deps.repo.closeSeason(input.seasonId)) return { success: false, error: 'not_active' };
	return { success: true };
}

export function listSeasons(deps: StatsDeps): { seasons: Season[]; activeSeason: Season | null } {
	return { seasons: deps.repo.listSeasons(), activeSeason: deps.repo.getActiveSeason() };
}

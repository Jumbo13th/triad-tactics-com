import type { StatsDeps } from '../ports';
import { getSeasonStandings, type SeasonStandings } from './getSeasonStandings';

/**
 * Standings for showcase surfaces (main-page teaser): the active season, or —
 * while it has no published games yet — the newest season that has some, so
 * the teaser (and its link to /stats) doesn't vanish right after a season
 * rollover. /stats itself keeps the plain active-season default; its season
 * pills cover the switch there.
 */
export function getShowcaseStandings(deps: StatsDeps): SeasonStandings {
	const current = getSeasonStandings(deps);
	if (current.rows.length > 0 || !current.season) return current;

	for (const season of deps.repo.listSeasons()) {
		if (season.id === current.season.id) continue;
		const standings = getSeasonStandings(deps, { seasonId: season.id });
		if (standings.rows.length > 0) return standings;
	}

	return current;
}

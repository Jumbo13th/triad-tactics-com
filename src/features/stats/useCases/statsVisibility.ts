import type { StatsDeps } from '../ports';

// Admin toggle for live-server testing: hides the statistics teaser on the
// MAIN PAGE only. /stats itself stays reachable by URL and the gameserver
// endpoints are unaffected (secret-authenticated).
export function getStatsVisibility(deps: StatsDeps): { hidden: boolean } {
	return { hidden: deps.repo.getStatsHidden() };
}

import type { StatsDeps, UnitHistoryEntry } from '../ports';

/** A unit's published per-game results, newest first (rows frozen at publish). */
export function getUnitHistory(deps: StatsDeps, input: { unitId: number }): UnitHistoryEntry[] {
	return deps.repo.getUnitHistory(input.unitId);
}

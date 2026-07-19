import type { GameserverUnitListItem } from '../domain/types';
import type { GetGameserverUnitsDeps } from '../ports';

export function getGameserverUnits(deps: GetGameserverUnitsDeps): { units: GameserverUnitListItem[] } {
	return { units: deps.repo.getAllUnits() };
}

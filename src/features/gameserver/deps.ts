import type { GetGameserverPlayerDeps, GetGameserverUnitsDeps } from './ports';
import { getAllUnits, getPlayerByArmaId } from './infra/sqliteGameserver';

export const getGameserverPlayerDeps: GetGameserverPlayerDeps = {
	repo: { getPlayerByArmaId },
};

export const getGameserverUnitsDeps: GetGameserverUnitsDeps = {
	repo: { getAllUnits },
};

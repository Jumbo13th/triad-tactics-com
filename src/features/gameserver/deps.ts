import type { GetGameserverPlayerDeps } from './ports';
import { getPlayerByArmaId } from './infra/sqliteGameserver';

export const getGameserverPlayerDeps: GetGameserverPlayerDeps = {
	repo: { getPlayerByArmaId },
};

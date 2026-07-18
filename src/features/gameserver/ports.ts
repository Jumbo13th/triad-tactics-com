import type { GameserverPlayer, GameserverUnitListItem } from './domain/types';

export type GameserverPlayerRepo = {
	getPlayerByArmaId: (input: { armaId: string }) => GameserverPlayer | null;
	getAllUnits: () => GameserverUnitListItem[];
};

export type GetGameserverPlayerDeps = {
	repo: Pick<GameserverPlayerRepo, 'getPlayerByArmaId'>;
};

export type GetGameserverUnitsDeps = {
	repo: Pick<GameserverPlayerRepo, 'getAllUnits'>;
};

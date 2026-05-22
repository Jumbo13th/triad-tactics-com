import type { GameserverPlayer } from './domain/types';

export type GameserverPlayerRepo = {
	getPlayerByArmaId: (input: { armaId: string }) => GameserverPlayer | null;
};

export type GetGameserverPlayerDeps = {
	repo: Pick<GameserverPlayerRepo, 'getPlayerByArmaId'>;
};

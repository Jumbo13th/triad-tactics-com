import type { GameserverPlayer } from '../domain/types';
import type { GetGameserverPlayerDeps } from '../ports';

type GetGameserverPlayerResult =
	| { success: true; player: GameserverPlayer }
	| { success: false; error: 'not_found' };

export function getGameserverPlayer(
	deps: GetGameserverPlayerDeps,
	input: { armaId: string }
): GetGameserverPlayerResult {
	const player = deps.repo.getPlayerByArmaId({ armaId: input.armaId });
	if (!player) return { success: false, error: 'not_found' };
	return { success: true, player };
}

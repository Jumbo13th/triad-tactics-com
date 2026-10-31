import type { ReplayGameListItem } from '../domain/types';
import type { AdminReplaysDeps } from '../ports';

export function listReplayGames(deps: AdminReplaysDeps, input: { limit: number; offset: number }): ReplayGameListItem[] {
	return deps.repo.listGames(input);
}

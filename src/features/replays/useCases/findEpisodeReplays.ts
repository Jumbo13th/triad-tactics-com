import type { PublicReplayListItem } from '../domain/types';
import type { PublicReplaysDeps } from '../ports';

// What other pages need to link to a replay: statistics and missions name a game by its
// mission episode, the replay page by its game id.

export type MissionEpisode = { missionId: number; episodeNumber: number };

/** The id of each episode's published replay, in the order asked, null where it has none. */
export function findEpisodeReplayIds(deps: Pick<PublicReplaysDeps, 'repo'>, episodes: MissionEpisode[]): (number | null)[] {
	const found = deps.repo.findEpisodeReplays(episodes);
	return episodes.map(
		(episode) =>
			found.find((replay) => replay.missionId === episode.missionId && replay.episodeNumber === episode.episodeNumber)?.gameId ??
			null
	);
}

export function findEpisodeReplayId(deps: Pick<PublicReplaysDeps, 'repo'>, episode: MissionEpisode): number | null {
	return findEpisodeReplayIds(deps, [episode])[0];
}

export function listMissionReplays(deps: Pick<PublicReplaysDeps, 'repo'>, input: { shortCode: string }): PublicReplayListItem[] {
	return deps.repo.listMissionReplays(input.shortCode);
}
